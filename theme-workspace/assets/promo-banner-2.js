var lastScrollTop2 = 0;

var promoBanner2 = function (e) {
  var st = window.pageYOffset || document.documentElement.scrollTop;
  var y = window.scrollY;
  var windowWidth = window.innerWidth;
  var scrollPosition = 350;

  if (windowWidth < 1024) {
    scrollPosition = 520;
  }

  document.body.classList.add("haspromobanner-2");

  if (st > lastScrollTop2) {
    // Scroll down
    if (y > scrollPosition) {
      document.body.classList.add("promobannercollapsed-2");
    }
  } else {
    // Scroll top
    if (y < scrollPosition) {
      document.body.classList.remove("promobannercollapsed-2");
    }
  }

  lastScrollTop2 = st <= 0 ? 0 : st;
};

window.addEventListener("scroll", promoBanner2);
