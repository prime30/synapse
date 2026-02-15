(function($){
  $(document).ready(function(){

    $("body").addClass("black_friday_banner");

    const $mainBanner   = $(".main--banner");
    const $stickyBanner = $(".sticky--banner");
    const $header       = $(".t4s-section-header");
    const stickyClass   = "shopify-section-header-sticky";

    let mainHeight   = $mainBanner.innerHeight();
    let stickyHeight = $stickyBanner.innerHeight();
    let triggerHeight = mainHeight - stickyHeight;

    
    $(window).on("load resize", function() {
      $('.black-friday-promo-banner').css('height', mainHeight);
      mainHeight   = $mainBanner.innerHeight();
      stickyHeight = $stickyBanner.innerHeight();
      triggerHeight = mainHeight - stickyHeight;
    });

    $(window).on("scroll", function(){
      const scrollY = window.scrollY || $(window).scrollTop();
      if(scrollY >= triggerHeight){
        $("body").addClass("show_sticky_banner");
      }
    });

    const observer = new MutationObserver(function(mutations){
      mutations.forEach(function(mutation){
        if(mutation.attributeName === "class"){
          const hasSticky = $header.hasClass(stickyClass);
          if(!hasSticky){
            $("body").removeClass("show_sticky_banner");
          }
        }
      });
    });

    if($header.length){
      observer.observe($header[0], { attributes: true });
    }

  });
})(jQuery);
