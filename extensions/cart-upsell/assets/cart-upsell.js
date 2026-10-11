(function () {
  if (window.__cartUpsellInit) return;
  window.__cartUpsellInit = true;

  var MAX_ITEMS = 20;
  var checkScheduled = false;
  var refreshScheduled = false;
  var lastImpressionKey = '';
  var impressedForExposure = {};
  var clickedForExposure = {};
  var activeImpressionObserver = null;
  var productCache = {};
  var shuffleSeed = Math.random();

  var MARKUP =
    '<div class="cart-upsell__header">' +
    '<p class="cart-upsell__title">Complete your order</p>' +
    '<div class="cart-upsell__nav" hidden>' +
    '<button type="button" class="cart-upsell__nav-btn" data-prev aria-label="Previous">‹</button>' +
    '<button type="button" class="cart-upsell__nav-btn" data-next aria-label="Next">›</button>' +
    '</div>' +
    '</div>' +
    '<div class="cart-upsell__track-wrapper"><div class="cart-upsell__track"></div></div>';

  function labelsFor(root) {
    var source = root.dataset.cartUpsellHeading
      ? root : document.querySelector('[data-cart-upsell-i18n]');
    var values = source ? source.dataset : {};
    return {
      heading: values.cartUpsellHeading || 'Complete your order',
      add: values.cartUpsellAdd || 'Add',
      select: values.cartUpsellSelect || 'Select',
      previous: values.cartUpsellPrevious || 'Previous',
      next: values.cartUpsellNext || 'Next',
    };
  }

  function inheritThemeButton(root) {
    var reference = document.querySelector(
      '.cart__checkout-button, [name="checkout"], .button--primary, .product-form__submit'
    );
    if (!reference) return;
    var styles = getComputedStyle(reference);
    if (styles.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
        styles.backgroundColor !== 'transparent') {
      root.style.setProperty('--cart-upsell-btn-bg', styles.backgroundColor);
      root.style.setProperty('--cart-upsell-btn-color', styles.color);
    }
    if (styles.borderRadius) {
      root.style.setProperty('--cart-upsell-btn-radius', styles.borderRadius);
    }
  }

  function shuffleRank(key, productId) {
    var hash = 2166136261;
    var text = key + ':' + productId;
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function ensureMounted(refresh) {
    document.querySelectorAll('[data-cart-upsell]').forEach(function (root) {
      if (!root.dataset.cartUpsellInit) {
        root.dataset.cartUpsellInit = 'true';
        if (!root.querySelector('.cart-upsell__header')) root.innerHTML = MARKUP;
        populate(root);
      } else if (refresh) {
        populate(root);
      }
    });

    var targets = document.querySelectorAll(
      'cart-drawer-component .cart-drawer__items, cart-drawer #CartDrawer-CartItems'
    );
    targets.forEach(function (target) {
      var drawer = target.closest('cart-drawer-component, cart-drawer');
      if (!drawer || drawer.querySelector('[data-cart-upsell]:not([data-cart-upsell-auto])')) return;
      if (target.nextElementSibling && target.nextElementSibling.matches('[data-cart-upsell-auto]')) return;

      var root = document.createElement('div');
      root.className = 'cart-upsell';
      root.hidden = true;
      root.dataset.cartUpsell = '';
      root.dataset.cartUpsellAuto = '';
      root.dataset.cartUpsellInit = 'true';
      root.innerHTML = MARKUP;
      target.insertAdjacentElement('afterend', root);
      populate(root);
    });
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
        return { config: config, cart: cart };
      })
      .then(function (data) {
        var config = data.config;
        var cart = data.cart;
        if (!cart.items || cart.items.length === 0) {
          return { config: config, cart: cart, products: [] };
        }
        var cartProductIds = cart.items.map(function (item) {
          return item.product_id;
        });
        var excludedProductIds = config.excludedProductIds || [];

        var seen = {};
        var products = (config.products || [])
          .filter(function (product) {
            if (cartProductIds.indexOf(product.productId) !== -1 ||
                excludedProductIds.indexOf(product.productId) !== -1 ||
                seen[product.productId]) {
              return false;
            }
            seen[product.productId] = true;
            return true;
          });

        return hydrateFallbackProducts(products, cart).then(function (hydrated) {
          var sameCurrency = !config.currency || config.currency === cart.currency;
          var eligible = hydrated.filter(function (product) {
            if (!sameCurrency) return true;
            return (config.minPrice === null || config.minPrice === undefined ||
                product.price >= config.minPrice) &&
              (config.maxPrice === null || config.maxPrice === undefined ||
                product.price <= config.maxPrice);
          });
          if (config.shuffleProducts) {
            var key = String(shuffleSeed) + ':' + cart.items.map(function (item) {
              return item.key;
            }).join('|');
            eligible.sort(function (a, b) {
              return shuffleRank(key, a.productId) - shuffleRank(key, b.productId);
            });
          }
          var limit = Number.isInteger(config.maxProducts) && config.maxProducts >= 1
            ? Math.min(config.maxProducts, MAX_ITEMS) : 6;
          return { config: config, cart: cart, products: eligible.slice(0, limit) };
        });
      })
      .then(function (data) {
        if (!root.isConnected || root.dataset.cartUpsellRequest !== String(requestId)) return;
        var config = data.config;
        var cart = data.cart;
        var products = data.products;

        if (products.length === 0) {
          if (activeImpressionObserver) activeImpressionObserver.disconnect();
          root.hidden = true;
          return;
        }

        root.innerHTML = MARKUP;
        var track = root.querySelector('.cart-upsell__track');
        var title = root.querySelector('.cart-upsell__title');
        var labels = labelsFor(root);
        root.dir = config.direction === 'rtl' ? 'rtl' : 'ltr';

        title.textContent = config.headingText || labels.heading;
        root.querySelector('[data-prev]').setAttribute('aria-label', labels.previous);
        root.querySelector('[data-next]').setAttribute('aria-label', labels.next);
        inheritThemeButton(root);
        if (config.buttonColor) {
          root.style.setProperty('--cart-upsell-btn-bg', config.buttonColor);
        }
        if (config.buttonTextColor) {
          root.style.setProperty('--cart-upsell-btn-color', config.buttonTextColor);
        }
        if (config.buttonBorderRadius !== null && config.buttonBorderRadius !== undefined) {
          root.style.setProperty('--cart-upsell-btn-radius', config.buttonBorderRadius + 'px');
        }
        var imageSize = Number.isInteger(config.imageSize) && config.imageSize >= 40 &&
          config.imageSize <= 120 ? config.imageSize : 64;
        root.style.setProperty('--cart-upsell-image-size', imageSize + 'px');
        var swatchSize = Number.isInteger(config.swatchSize) && config.swatchSize >= 16 &&
          config.swatchSize <= 48 ? config.swatchSize : 28;
        root.style.setProperty('--cart-upsell-swatch-size', swatchSize + 'px');
        root.style.setProperty('--cart-upsell-swatch-radius',
          config.swatchShape === 'square' ? '4px' : '50%');
        if (config.itemGap !== null && config.itemGap !== undefined) {
          root.style.setProperty('--cart-upsell-item-gap', config.itemGap + 'px');
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
          track.appendChild(renderItem(product, formatter, config.buttonLabel || labels.add,
            imageSize, config, labels));
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
          image: variant.featured_image && variant.featured_image.src || product.image,
          price: Number(variant.price) / 100,
          currency: cart.currency,
          variants: variants,
          options: (storefrontProduct.options || []).map(function (option) {
            return typeof option === 'string' ? option : option.name;
          }),
          fallbackImage: product.image,
        };
      });
    })).then(function (hydrated) {
      return hydrated.filter(Boolean);
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

  function renderItem(product, formatter, buttonLabel, imageSize, config, labels) {
    var item = document.createElement('div');
    item.className = 'cart-upsell__item';
    item.dataset.cartUpsellProductId = String(product.productId);

    var price = formatter ? formatter.format(Number(product.price)) : product.price;

    item.innerHTML =
      '<a href="' + escapeAttribute(product.url) + '" class="cart-upsell__img-link" tabindex="-1">' +
      (product.image
        ? '<img class="cart-upsell__img" src="' +
          escapeAttribute(product.image) +
          '" alt="" width="' + imageSize + '" height="' + imageSize + '" loading="lazy">'
        : '') +
      '</a>' +
      '<div class="cart-upsell__info">' +
      '<a href="' + escapeAttribute(product.url) + '" class="cart-upsell__name">' + escapeHtml(product.title) + '</a>' +
      '<span class="cart-upsell__price">' + escapeHtml(price) + '</span>' +
      '<div class="cart-upsell__options" hidden></div>' +
      '</div>' +
      '<button type="button" class="cart-upsell__btn" data-variant-id="' + product.variantId + '">' +
      escapeHtml(product.variants && product.variants.length > 1 ? labels.select : buttonLabel) + '</button>';

    var button = item.querySelector('.cart-upsell__btn');
    var image = item.querySelector('.cart-upsell__img');
    var variant = product.variants && product.variants.find(function (candidate) {
      return Number(candidate.id) === product.variantId;
    });
    var pickerOpen = false;
    if (image) {
      image.style.setProperty('width', imageSize + 'px', 'important');
      image.style.setProperty('height', imageSize + 'px', 'important');
      image.style.setProperty('max-width', 'none', 'important');
    }
    button.addEventListener('click', function () {
      trackOfferClick(product.productId);
      if (product.variants && product.variants.length > 1 && !pickerOpen) {
        pickerOpen = true;
        item.classList.add('cart-upsell__item--expanded');
        item.querySelector('.cart-upsell__options').hidden = false;
        button.textContent = buttonLabel;
        renderOptions();
        return;
      }
      addToCart(button, product);
    });

    function renderOptions() {
      var holder = item.querySelector('.cart-upsell__options');
      holder.replaceChildren();
      var optionNames = product.options || [];
      optionNames.forEach(function (name, index) {
        var values = [];
        product.variants.forEach(function (candidate) {
          var value = candidate['option' + (index + 1)];
          if (value && values.indexOf(value) === -1) values.push(value);
        });
        if (values.length < 2) return;

        var group = document.createElement('div');
        group.className = 'cart-upsell__option';
        var caption = document.createElement('span');
        caption.className = 'cart-upsell__option-label';
        caption.textContent = name;
        group.appendChild(caption);
        var color = /^(color|colour|couleur|farbe|колір|цвет|coloris)$/i.test(name);
        var dropdown = !color && config.otherOptionStyle === 'dropdown';
        var control = document.createElement(dropdown ? 'select' : 'div');
        control.className = dropdown ? 'cart-upsell__select' : 'cart-upsell__choices';
        if (dropdown) control.setAttribute('aria-label', name);

        values.forEach(function (value) {
          var available = product.variants.some(function (candidate) {
            return candidate.available && candidate['option' + (index + 1)] === value;
          });
          var selected = variant['option' + (index + 1)] === value;
          var choice = document.createElement(dropdown ? 'option' : 'button');
          choice.value = value;
          choice.textContent = dropdown ? value : (color ? '' : value);
          choice.disabled = !available;
          if (dropdown) {
            choice.selected = selected;
          } else {
            choice.type = 'button';
            choice.className = color ? 'cart-upsell__swatch' : 'cart-upsell__text-choice';
            choice.classList.toggle('is-selected', selected);
            choice.setAttribute('aria-label', name + ': ' + value);
            choice.setAttribute('aria-pressed', String(selected));
            if (color) {
              var commonColors = {
                burgundy: '#800020', navy: '#000080', cream: '#fffdd0',
                ivory: '#fffff0', charcoal: '#36454f', tan: '#d2b48c',
                blush: '#de9b9b', rose: '#e8a0a8', gold: '#d4af37',
                silver: '#c0c0c0', grey: '#808080', gray: '#808080',
              };
              var colorValue = commonColors[value.toLowerCase()] ||
                (CSS.supports('color', value) ? value : '#dedede');
              choice.style.backgroundColor = colorValue;
              choice.title = value;
              if (colorValue === '#dedede') choice.textContent = value.slice(0, 1).toUpperCase();
            }
            choice.addEventListener('click', function () { selectValue(index, value); });
          }
          control.appendChild(choice);
        });
        if (dropdown) control.addEventListener('change', function () {
          selectValue(index, control.value);
        });
        group.appendChild(control);
        holder.appendChild(group);
      });
    }

    function selectValue(index, value) {
      var matches = product.variants.filter(function (candidate) {
        return candidate.available && candidate['option' + (index + 1)] === value;
      });
      var next = matches.find(function (candidate) {
        return (product.options || []).every(function (_, otherIndex) {
          return otherIndex === index || candidate['option' + (otherIndex + 1)] ===
            variant['option' + (otherIndex + 1)];
        });
      }) || matches[0];
      if (!next) return;
      variant = next;
      product.variantId = Number(next.id);
      product.price = Number(next.price) / 100;
      product.image = next.featured_image && next.featured_image.src || product.fallbackImage;
      product.url = window.Shopify.routes.root + 'products/' + encodeURIComponent(product.handle) +
        '?variant=' + next.id;
      item.querySelector('.cart-upsell__price').textContent = formatter
        ? formatter.format(product.price) : String(product.price);
      item.querySelectorAll('a').forEach(function (link) { link.href = product.url; });
      if (image && product.image) image.src = product.image;
      button.dataset.variantId = String(product.variantId);
      renderOptions();
    }

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

    var standardAction = window.Shopify && window.Shopify.actions &&
      window.Shopify.actions.updateCart;
    var update = standardAction
      ? standardAction({ lines: [{
          merchandiseId: String(product.variantId),
          quantity: 1,
          attributes: [{ key: '_cart_upsell_app', value: 'cart-upsell' }],
        }] }).then(function (result) {
          if (result.userErrors && result.userErrors.length) throw new Error('Cart add failed');
          return result;
        })
      : fetch(window.Shopify.routes.root + 'cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            id: product.variantId,
            quantity: 1,
            properties: { _cart_upsell_app: 'cart-upsell' },
          }),
        }).then(function (response) {
          if (!response.ok) throw new Error('Cart add failed');
          return refreshCartDrawer();
        });

    update
      .then(function (response) {
        trackEvent('add_to_cart', product.productId);
        return response;
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

  function refreshCartDrawer() {
    var isHorizon = Boolean(document.querySelector('cart-drawer-component .cart-drawer__inner'));
    var section = isHorizon ? 'cart-drawer-section' : 'cart-drawer';
    var selector = isHorizon
      ? 'cart-drawer-component .cart-drawer__inner'
      : 'cart-drawer .drawer__inner';
    return fetch(window.Shopify.routes.root + '?sections=' + section)
      .then(function (r) {
        return r.json();
      })
      .then(function (sections) {
        var html = sections[section];
        if (!html) return;

        var freshInner = new DOMParser()
          .parseFromString(html, 'text/html')
          .querySelector(selector);
        var currentInner = document.querySelector(selector);

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
    div.textContent = String(value);
    return div.innerHTML;
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

  var observer = new MutationObserver(function (mutations) {
    var cartItemsChanged = mutations.some(function (mutation) {
      return mutation.target.nodeType === 1 &&
        !mutation.target.closest('[data-cart-upsell]') &&
        mutation.target.closest('cart-drawer-component .cart-drawer__items, cart-drawer #CartDrawer-CartItems');
    });
    scheduleCheck(Boolean(cartItemsChanged));
  });
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('shopify:cart:lines-update', function () { scheduleCheck(true); });
})();
