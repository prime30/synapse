// var promoBannerExpanded = document.querySelector(".promo-banner-expanded");
// var promoBannerCollapsed = document.querySelector(".promo-banner-collapsed");

var lastScrollTop = 0;

var promoBanner = function (e) {
  var st = window.pageYOffset || document.documentElement.scrollTop;
  var y = window.scrollY;
  var windowWidth = window.innerWidth;
  var scrollPosition = 400;

  if (windowWidth < 1024) {
    scrollPosition = 520;
  }

  document.body.classList.add("haspromobanner");

  if (st > lastScrollTop) {
    // Scroll down
    if (y > scrollPosition) {
      document.body.classList.add("promobannercollapsed");
    }
  } else {
    // Scroll top
    if (y < scrollPosition) {
      document.body.classList.remove("promobannercollapsed");
    }
  }

  lastScrollTop = st <= 0 ? 0 : st;
};

window.addEventListener("scroll", promoBanner);
