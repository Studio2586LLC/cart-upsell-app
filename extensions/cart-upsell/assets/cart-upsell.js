(function () {
  if (window.__cartUpsellInit) return;
  window.__cartUpsellInit = true;

  var MAX_ITEMS = 6;
  var MAX_RECOMMENDATION_SEEDS = 3;
  var checkScheduled = false;
  var refreshScheduled = false;
  var lastImpressionKey = '';
  var impressedForExposure = {};
  var clickedForExposure = {};
  var activeImpressionObserver = null;
  var productCache = {};

  var MARKUP =
    '<div class="cart-upsell__header">' +
    '<p class="cart-upsell__title">Complete your order</p>' +
    '<div class="cart-upsell__nav" hidden>' +
    '<button type="button" class="cart-upsell__nav-btn" data-prev aria-label="Previous">‹</button>' +
    '<button type="button" class="cart-upsell__nav-btn" data-next aria-label="Next">›</button>' +
    '</div>' +
    '</div>' +
    '<div class="cart-upsell__track-wrapper"><div class="cart-upsell__track"></div></div>';

  function ensureMounted(refresh) {
    var existing = document.querySelector('[data-cart-upsell]');
    if (existing) {
      if (!existing.dataset.cartUpsellInit) {
        existing.dataset.cartUpsellInit = 'true';
        if (!existing.querySelector('.cart-upsell__header')) {
          existing.innerHTML = MARKUP;
        }
        populate(existing);
      } else if (refresh) {
        populate(existing);
      }
      return;
    }

    var itemsWrap = document.querySelector('cart-drawer-component .cart-drawer__items');
    if (!itemsWrap) return;

    var next = itemsWrap.nextElementSibling;
    if (next && next.classList.contains('cart-upsell')) return;

    var root = document.createElement('div');
    root.className = 'cart-upsell';
    root.hidden = true;
    root.dataset.cartUpsell = '';
    root.dataset.cartUpsellInit = 'true';
    root.innerHTML = MARKUP;

    itemsWrap.insertAdjacentElement('afterend', root);
    populate(root);
  }

  function populate(root) {
    var requestId = Number(root.dataset.cartUpsellRequest || 0) + 1;
    root.dataset.cartUpsellRequest = String(requestId);

    Promise.all([
      fetch(window.Shopify.routes.root + 'apps/cart-upsell').then(function (r) {
        return r.json();
      }),
      fetch(window.Shopify.routes.root + 'cart.js').then(function (r) {
        return r.json();
      }),
    ])
      .then(function (results) {
        var config = results[0];
        var cart = results[1];
        if (config.sourceType !== 'automatic') {
          return { config: config, cart: cart, recommendations: [] };
        }
        return fetchRecommendations(cart).then(function (recommendations) {
          return { config: config, cart: cart, recommendations: recommendations };
        });
      })
      .then(function (data) {
        var config = data.config;
        var cart = data.cart;
        var cartProductIds = cart.items.map(function (item) {
          return item.product_id;
        });

        var seen = {};
        var products = (config.pinnedProducts || [])
          .concat(data.recommendations, config.products || [])
          .filter(function (product) {
            if (cartProductIds.indexOf(product.productId) !== -1 || seen[product.productId]) {
              return false;
            }
            seen[product.productId] = true;
            return true;
          }).slice(0, MAX_ITEMS);

        return hydrateFallbackProducts(products, cart).then(function (hydrated) {
          return { config: config, cart: cart, products: hydrated };
        });
      })
      .then(function (data) {
        if (!root.isConnected || root.dataset.cartUpsellRequest !== String(requestId)) return;
        var config = data.config;
        var cart = data.cart;
        var products = data.products;

        if (products.length === 0) {
          root.hidden = true;
          return;
        }

        root.innerHTML = MARKUP;
        var track = root.querySelector('.cart-upsell__track');
        var title = root.querySelector('.cart-upsell__title');
        root.dir = config.direction === 'rtl' ? 'rtl' : 'ltr';

        if (config.headingText) {
          title.textContent = config.headingText;
        }
        if (config.buttonColor) {
          root.style.setProperty('--cart-upsell-btn-bg', config.buttonColor);
        }
        if (config.buttonTextColor) {
          root.style.setProperty('--cart-upsell-btn-color', config.buttonTextColor);
        }
        if (config.buttonBorderRadius) {
          root.style.setProperty('--cart-upsell-btn-radius', config.buttonBorderRadius + 'px');
        }

        var isSlider = config.displayMode === 'slider';
        track.classList.add(isSlider ? 'cart-upsell__track--slider' : 'cart-upsell__track--list');

        products.forEach(function (product) {
          var formatter = null;
          try {
            formatter = new Intl.NumberFormat(document.documentElement.lang || undefined, {
              style: 'currency',
              currency: product.currency || config.currency || 'USD',
            });
          } catch (e) {
            formatter = null;
          }
          track.appendChild(renderItem(product, formatter));
        });

        if (isSlider) {
          setUpSlider(root, track, products.length);
        }

        root.hidden = false;
        var impressionKey = cart.items.map(function (item) {
          return item.key;
        }).join('|') + ':' + products.map(function (product) {
          return product.productId;
        }).join(',');
        observeOfferImpressions(root, impressionKey);
      })
      .catch(function () {
        if (!root.isConnected || root.dataset.cartUpsellRequest !== String(requestId)) return;
        // Keep the initialized root mounted. Removing it would trigger the
        // drawer observer, which would immediately mount and fetch again.
        root.hidden = true;
      });
  }

  function hydrateFallbackProducts(products, cart) {
    return Promise.all(products.map(function (product) {
      if (product.currency) return Promise.resolve(product);
      if (!product.handle) return Promise.resolve(null);

      var url = window.Shopify.routes.root + 'products/' + encodeURIComponent(product.handle) + '.js';
      var cacheKey = url + '|' + cart.currency;
      if (!productCache[cacheKey]) {
        productCache[cacheKey] = fetch(url).then(function (response) {
          if (!response.ok) throw new Error('Product unavailable');
          return response.json();
        }).catch(function () {
          delete productCache[cacheKey];
          return null;
        });
      }

      return productCache[cacheKey].then(function (storefrontProduct) {
        if (!storefrontProduct) return null;
        var variants = storefrontProduct.variants || [];
        var variant = variants.find(function (candidate) {
          return candidate.available && Number(candidate.id) === product.variantId;
        }) || variants.find(function (candidate) {
          return candidate.available;
        });
        if (!variant || !Number.isFinite(Number(variant.price))) return null;

        return {
          productId: product.productId,
          variantId: Number(variant.id),
          title: storefrontProduct.title || product.title,
          handle: product.handle,
          url: window.Shopify.routes.root + 'products/' + encodeURIComponent(product.handle) +
            '?variant=' + variant.id,
          image: product.image,
          price: Number(variant.price) / 100,
          currency: cart.currency,
        };
      });
    })).then(function (hydrated) {
      return hydrated.filter(Boolean);
    });
  }

  function fetchRecommendations(cart) {
    var seeds = [];
    cart.items.slice().sort(function (a, b) {
      return (b.final_line_price || 0) - (a.final_line_price || 0);
    }).forEach(function (item) {
      if (seeds.length < MAX_RECOMMENDATION_SEEDS && seeds.indexOf(item.product_id) === -1) {
        seeds.push(item.product_id);
      }
    });

    return Promise.all(seeds.map(function (productId) {
      var url = window.Shopify.routes.root +
        'recommendations/products.json?intent=related&limit=10&product_id=' + productId;
      return fetch(url)
        .then(function (response) {
          if (!response.ok) return { products: [] };
          return response.json();
        })
        .then(function (data) {
          return data.products || [];
        })
        .catch(function () {
          return [];
        });
    })).then(function (groups) {
      var candidates = {};
      groups.forEach(function (group, seedIndex) {
        group.forEach(function (product, position) {
          var variant = (product.variants || []).find(function (candidate) {
            return candidate.available;
          });
          if (!product.available || !variant) return;

          var price = Number(variant.price) / 100;
          if (!Number.isFinite(price) || price <= 0) return;
          var cartSubtotal = Number(cart.items_subtotal_price) / 100;
          var score = 10 - position + (price <= cartSubtotal / 2 ? 5 : 0);
          var id = String(product.id);
          if (candidates[id]) {
            candidates[id].score += score + 10;
            return;
          }

          candidates[id] = {
            productId: Number(product.id),
            variantId: Number(variant.id),
            title: product.title,
            url: product.url.indexOf('/products/') === 0
              ? window.Shopify.routes.root + product.url.slice(1)
              : product.url,
            image: product.featured_image || (product.images || [])[0] || null,
            price: price,
            currency: cart.currency,
            score: score - seedIndex,
          };
        });
      });

      return Object.keys(candidates).map(function (id) {
        return candidates[id];
      }).sort(function (a, b) {
        return b.score - a.score;
      });
    });
  }

  function setUpSlider(root, track, itemCount) {
    var wrapper = root.querySelector('.cart-upsell__track-wrapper');
    var nav = root.querySelector('.cart-upsell__nav');
    var prevBtn = root.querySelector('[data-prev]');
    var nextBtn = root.querySelector('[data-next]');
    var index = 0;
    var isRtl = root.dir === 'rtl';

    function update() {
      var sign = isRtl ? 1 : -1;
      track.style.transform = 'translateX(' + sign * index * 100 + '%)';
    }

    function go(delta) {
      index = Math.max(0, Math.min(itemCount - 1, index + delta));
      update();
    }

    if (itemCount > 1 && nav) {
      nav.hidden = false;
      prevBtn.addEventListener('click', function () {
        go(-1);
      });
      nextBtn.addEventListener('click', function () {
        go(1);
      });
    }

    var startX = null;
    wrapper.addEventListener(
      'touchstart',
      function (e) {
        startX = e.touches[0].clientX;
      },
      { passive: true },
    );
    wrapper.addEventListener(
      'touchend',
      function (e) {
        if (startX === null) return;
        var deltaX = e.changedTouches[0].clientX - startX;
        startX = null;
        if (Math.abs(deltaX) < 30) return;
        var direction = deltaX < 0 ? 1 : -1;
        go(isRtl ? -direction : direction);
      },
      { passive: true },
    );

    update();
  }

  function renderItem(product, formatter) {
    var item = document.createElement('div');
    item.className = 'cart-upsell__item';
    item.dataset.cartUpsellProductId = String(product.productId);

    var price = formatter ? formatter.format(Number(product.price)) : product.price;

    item.innerHTML =
      '<a href="' + product.url + '" class="cart-upsell__img-link" tabindex="-1">' +
      (product.image
        ? '<img class="cart-upsell__img" src="' +
          product.image +
          '" alt="" width="64" height="64" loading="lazy">'
        : '') +
      '</a>' +
      '<div class="cart-upsell__info">' +
      '<a href="' + product.url + '" class="cart-upsell__name">' + escapeHtml(product.title) + '</a>' +
      '<span class="cart-upsell__price">' + escapeHtml(price) + '</span>' +
      '</div>' +
      '<button type="button" class="cart-upsell__btn" data-variant-id="' + product.variantId + '">Add</button>';

    var button = item.querySelector('.cart-upsell__btn');
    button.addEventListener('click', function () {
      trackOfferClick(product.productId);
      addToCart(button, product);
    });

    item.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        trackOfferClick(product.productId);
      });
    });

    return item;
  }

  function addToCart(button, product) {
    button.disabled = true;
    var originalText = button.textContent;
    button.textContent = '...';

    fetch(window.Shopify.routes.root + 'cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        id: product.variantId,
        quantity: 1,
        properties: { _cart_upsell_app: 'cart-upsell' },
      }),
    })
      .then(function (response) {
        if (!response.ok) throw new Error('Cart add failed');
        trackEvent('add_to_cart', product.productId);
        return refreshCartDrawer();
      })
      .then(function () {
        var root = button.closest('[data-cart-upsell]');
        if (root && root.isConnected) populate(root);
        button.textContent = '✓';
        button.style.opacity = '0.5';
      })
      .catch(function () {
        button.disabled = false;
        button.textContent = originalText;
      });
  }

  // Horizon's own drawer refresh is driven by an internal, undocumented
  // event class (@shopify/events' CartLinesUpdateEvent) that isn't safe to
  // hand-construct. Instead, re-fetch the drawer's section HTML via the
  // public Section Rendering API and swap in just the inner content — this
  // is what actually refreshes the line items/summary after our add-to-cart
  // call. We deliberately swap only `.cart-drawer__inner`, not the whole
  // section, so the surrounding <dialog>/<theme-drawer> keeps its open
  // state and animations instead of being destroyed mid-interaction.
  function refreshCartDrawer() {
    return fetch(window.Shopify.routes.root + '?sections=cart-drawer-section')
      .then(function (r) {
        return r.json();
      })
      .then(function (sections) {
        var html = sections['cart-drawer-section'];
        if (!html) return;

        var freshInner = new DOMParser()
          .parseFromString(html, 'text/html')
          .querySelector('.cart-drawer__inner');
        var currentInner = document.querySelector('cart-drawer-component .cart-drawer__inner');

        if (freshInner && currentInner) {
          currentInner.replaceWith(freshInner);
        }
      })
      .catch(function () {});
  }

  function trackEvent(type, productIds) {
    var body = type === 'impression'
      ? { type: type, productIds: productIds }
      : { type: type, productId: productIds, quantity: 1 };
    fetch(window.Shopify.routes.root + 'apps/cart-upsell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: type === 'click',
    }).catch(function () {});
  }

  function trackOfferClick(productId) {
    if (clickedForExposure[productId]) return;
    markImpressions([productId]);
    clickedForExposure[productId] = true;
    trackEvent('click', productId);
  }

  function markImpressions(productIds) {
    var newIds = productIds.filter(function (id) {
      if (impressedForExposure[id]) return false;
      impressedForExposure[id] = true;
      return true;
    });
    if (newIds.length) trackEvent('impression', newIds);
  }

  function observeOfferImpressions(root, impressionKey) {
    if (activeImpressionObserver) activeImpressionObserver.disconnect();
    if (impressionKey !== lastImpressionKey) {
      lastImpressionKey = impressionKey;
      impressedForExposure = {};
      clickedForExposure = {};
    }

    var items = root.querySelectorAll('.cart-upsell__item');
    if (!('IntersectionObserver' in window)) {
      markImpressions(Array.from(items, function (item) {
        return Number(item.dataset.cartUpsellProductId);
      }));
      return;
    }

    activeImpressionObserver = new IntersectionObserver(function (entries) {
      if (!root.isConnected || impressionKey !== lastImpressionKey) return;
      markImpressions(entries.filter(function (entry) {
        return entry.isIntersecting && entry.intersectionRatio >= 0.5;
      }).map(function (entry) {
        return Number(entry.target.dataset.cartUpsellProductId);
      }));
    }, { threshold: 0.5 });
    items.forEach(function (item) {
      activeImpressionObserver.observe(item);
    });
  }

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  function scheduleCheck(refresh) {
    refreshScheduled = refreshScheduled || refresh === true;
    if (checkScheduled) return;
    checkScheduled = true;
    requestAnimationFrame(function () {
      checkScheduled = false;
      ensureMounted(refreshScheduled);
      refreshScheduled = false;
    });
  }

  scheduleCheck(false);
  document.addEventListener('DOMContentLoaded', function () { scheduleCheck(false); });

  var observeTarget = document.getElementById('cart-drawer') || document.body;
  var observer = new MutationObserver(function (mutations) {
    var cartItemsChanged = mutations.some(function (mutation) {
      return mutation.target.nodeType === 1 &&
        mutation.target.closest('cart-drawer-component .cart-drawer__items');
    });
    scheduleCheck(Boolean(cartItemsChanged));
  });
  observer.observe(observeTarget, { childList: true, subtree: true });
})();
