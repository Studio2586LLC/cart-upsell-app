(function () {
  if (window.__cartUpsellInit) return;
  window.__cartUpsellInit = true;

  var MAX_ITEMS = 6;
  var checkScheduled = false;

  var MARKUP =
    '<div class="cart-upsell__header">' +
    '<p class="cart-upsell__title">Complete your order</p>' +
    '<div class="cart-upsell__nav" hidden>' +
    '<button type="button" class="cart-upsell__nav-btn" data-prev aria-label="Previous">‹</button>' +
    '<button type="button" class="cart-upsell__nav-btn" data-next aria-label="Next">›</button>' +
    '</div>' +
    '</div>' +
    '<div class="cart-upsell__track-wrapper"><div class="cart-upsell__track"></div></div>';

  function ensureMounted() {
    var existing = document.querySelector('[data-cart-upsell]');
    if (existing) {
      if (!existing.dataset.cartUpsellInit) {
        existing.dataset.cartUpsellInit = 'true';
        if (!existing.querySelector('.cart-upsell__header')) {
          existing.innerHTML = MARKUP;
        }
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
    root.dataset.cartUpsellInit = 'true';
    root.innerHTML = MARKUP;

    itemsWrap.insertAdjacentElement('afterend', root);
    populate(root);
  }

  function populate(root) {
    var track = root.querySelector('.cart-upsell__track');
    var title = root.querySelector('.cart-upsell__title');

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
        var cartProductIds = cart.items.map(function (item) {
          return item.product_id;
        });

        var products = (config.products || [])
          .filter(function (product) {
            return cartProductIds.indexOf(product.productId) === -1;
          })
          .slice(0, MAX_ITEMS);

        if (products.length === 0) {
          root.remove();
          return;
        }

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

        var formatter = null;
        try {
          formatter = new Intl.NumberFormat(document.documentElement.lang || undefined, {
            style: 'currency',
            currency: config.currency || 'USD',
          });
        } catch (e) {
          formatter = null;
        }

        products.forEach(function (product) {
          track.appendChild(renderItem(product, formatter));
        });

        if (isSlider) {
          setUpSlider(root, track, products.length);
        }

        root.hidden = false;
      })
      .catch(function () {
        root.remove();
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
      addToCart(button, product);
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
        trackAddToCart(product.productId);
        return fetch(window.Shopify.routes.root + 'cart.js').then(function (r) {
          return r.json();
        });
      })
      .then(function (cart) {
        document.dispatchEvent(
          new CustomEvent('cart:update', {
            bubbles: true,
            detail: { resource: cart, data: { itemCount: cart.item_count } },
          }),
        );
        button.textContent = '✓';
        button.style.opacity = '0.5';
      })
      .catch(function () {
        button.disabled = false;
        button.textContent = originalText;
      });
  }

  function trackAddToCart(productId) {
    fetch(window.Shopify.routes.root + 'apps/cart-upsell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: productId, quantity: 1 }),
    }).catch(function () {});
  }

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  function scheduleCheck() {
    if (checkScheduled) return;
    checkScheduled = true;
    requestAnimationFrame(function () {
      checkScheduled = false;
      ensureMounted();
    });
  }

  scheduleCheck();
  document.addEventListener('DOMContentLoaded', scheduleCheck);

  var observeTarget = document.getElementById('cart-drawer') || document.body;
  var observer = new MutationObserver(scheduleCheck);
  observer.observe(observeTarget, { childList: true, subtree: true });
})();
