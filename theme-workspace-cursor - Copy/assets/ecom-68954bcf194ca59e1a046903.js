/* Publish by EComposer at 2025-08-11 23:24:41*/
                (function(){
                    const Func = (function() {
                        'use strict';
window.__ectimmers = window.__ectimmers ||{};window.__ectimmers["ecom-y5088pis3y"]=  window.__ectimmers["ecom-y5088pis3y"] || {};
if(!this.$el)return;const e=this.$el,i=e.querySelector(".ecom-text_view-more-btn"),t=e.querySelector(".ecom-text_view-less-btn"),o=e.querySelector(".text-content.ecom-html");!o||(i&&i.addEventListener("click",()=>{o.classList.remove("ecom-text--is-mark"),o.style.maxHeight="",i.style.display="none",t.style.display=""}),t&&t.addEventListener("click",()=>{o.classList.add("ecom-text--is-mark"),o.style.maxHeight="var(--ecom-text-height)",t.style.display="none",i.style.display=""}))

                    });
                    
                        document.querySelectorAll('.ecom-y5088pis3y').forEach(function(el){
                            Func.call({$el: el, id: 'ecom-y5088pis3y', settings: {},isLive: true});
                        });
                    
                        document.querySelectorAll('.ecom-7dwkr1tpqoc').forEach(function(el){
                            Func.call({$el: el, id: 'ecom-7dwkr1tpqoc', settings: {},isLive: true});
                        });
                    
                        document.querySelectorAll('.ecom-a1up8fcjeae').forEach(function(el){
                            Func.call({$el: el, id: 'ecom-a1up8fcjeae', settings: {},isLive: true});
                        });
                    
                        document.querySelectorAll('.ecom-r9gqwwd84od').forEach(function(el){
                            Func.call({$el: el, id: 'ecom-r9gqwwd84od', settings: {},isLive: true});
                        });
                    
                        document.querySelectorAll('.ecom-mskttm9qwr').forEach(function(el){
                            Func.call({$el: el, id: 'ecom-mskttm9qwr', settings: {},isLive: true});
                        });
                    

                })();
            
                (function(){
                    const Func = (function() {
                        'use strict';
window.__ectimmers = window.__ectimmers ||{};window.__ectimmers["ecom-ml8pt4jlb1c"]=  window.__ectimmers["ecom-ml8pt4jlb1c"] || {};
if(!this.$el)return!1;const e=this.$el;this.settings.animation&&function(t){if(!e)return;const o=e.querySelector(".ecom__element--button");if(!o)return;let n=parseInt(t.settings.animation_loop_time)*1e3||6e3,s=1e3;window.__ectimmers["ecom-ml8pt4jlb1c"]["v4w423ukz"] = setInterval(function(){o.classList.add("animated"),setTimeout(function(){o.classList.remove("animated")},s)},n)}(this);var i=e.querySelector(".ecom__element--button");this.isLive&&i&&i.dataset.ecTrackingId&&i.addEventListener("click",function(t){if(window.Shopify.analytics){t.preventDefault();let o=document.createElement("div");document.body.appendChild(o),o.click();let n=window.EComposer.PAGE||window.EComposer.TEMPLATE||window.EComposer.SECTION||window.EComposer.BLOCK||{};const s=Object.assign({button_id:i.id,tracking_id:i.dataset.ecTrackingId},n);Shopify.analytics.publish("ec_custom_events",s),i.cloneNode(!0).click()}},{once:!0}),this.isLive&&i&&i.dataset.eventTrackingFb&&i.addEventListener("click",function(t){window.fbq&&window.fbq("track",`${i.dataset.eventTrackingFb}`)},{once:!0})

                    });
                    
                        document.querySelectorAll('.ecom-ml8pt4jlb1c').forEach(function(el){
                            Func.call({$el: el, id: 'ecom-ml8pt4jlb1c', settings: {"animation":false},isLive: true});
                        });
                    

                })();
            
                (function(){
                    const Func = (function() {
                        'use strict';
window.__ectimmers = window.__ectimmers ||{};window.__ectimmers["ecom-s6ta25agz2s"]=  window.__ectimmers["ecom-s6ta25agz2s"] || {};
if(!this.$el)return;this.isLive,this.$el;let e=document.querySelector('html[dir="rtl"]');class i extends HTMLElement{constructor(){super(),this.containerWidth=0,this.marqueeWidth=0,this.multiplier=1,this.isMounted=!1,this.styleProp={},this.classNameProp="",this.autoFillProp=!1,this.playProp=!0,this.pauseOnHoverProp=!1,this.pauseOnClickProp=!1,this.directionProp="left",this.speedProp=50,this.delayProp=0,this.loopProp=0,this.gradientProp=!1,this.gradientColorProp="white",this.gradientWidthProp=200,this.rootRef=null,this.containerRef=null,this.marqueeRef=null,this.childrenHtml=this.innerHTML,this.interval=0,this.render()}static get observedAttributes(){return["style","class-name","auto-fill","play","pause-on-hover","pause-on-click","direction","speed","delay","loop","gradient","gradient-color","gradient-width"]}connectedCallback(){this.isMounted=!0;const o=this.querySelectorAll("img");o.length>0?Promise.all(Array.from(o).filter(n=>!n.complete).map(n=>new Promise(s=>{n.onload=n.onerror=s}))).then(()=>{this.interval= window.__ectimmers["ecom-s6ta25agz2s"]["4yhlpztz6"] = setInterval(()=>this.handle(),500)}):(setTimeout(()=>{this.handle()},500),this.interval= window.__ectimmers["ecom-s6ta25agz2s"]["11e6qyad7"] = setInterval(()=>this.handle(),500))}attributeChangedCallback(o,n,s){switch(o){case"style":this.styleProp=s;break;case"class-name":this.classNameProp=s;break;case"auto-fill":this.autoFillProp=s!==null;break;case"play":this.playProp=s!==null;break;case"pause-on-hover":this.pauseOnHoverProp=s=="true";break;case"pause-on-click":this.pauseOnClickProp=s!==null;break;case"direction":s=="right"?this.directionProp=e?"right":"left":this.directionProp=e?"left":"right";break;case"speed":this.speedProp=parseInt(s,10)||50;break;case"delay":this.delayProp=parseInt(s,10)||0;break;case"loop":this.loopProp=parseInt(s,10)||0;break;case"gradient":this.gradientProp=s!==null;break;case"gradient-color":this.gradientColorProp=s||"white";break;case"gradient-width":this.gradientWidthProp=parseInt(s,10)||200;break}this.render()}render(){const o=`
                        --transform: ${this.directionProp==="up"?"rotate(-90deg)":this.directionProp==="down"?"rotate(90deg)":"none"};
                        --width: ${this.directionProp==="up"||this.directionProp==="down"?"100vh":"100%"};
                        --pause-on-hover: ${!this.playProp||this.pauseOnHoverProp?"paused":"running"};
                        display: flex;
                        `,n=`

                        --duration: ${this.duration}s;
                        --play: ${this.playProp?"running":"pause"};
                        --direction: ${this.directionProp==="left"?"normal":"reverse"};
                        --delay: 0s;
                        --iteration-count: infinite;
                        --min-width: ${this.autoFillProp?"auto":"100%"};
                        --percent-start: ${e?"100%":"0%"};
                        --percent-end: ${e?"0%":"-100%"};
                        display: flex;
                    `,s=`
                        <div class="ecom-text-marquee-container ${this.classNameProp}" style="${o}">
                            <div class="ecom-text-marque-wrapper" style="${n}">
                                ${this.renderChildren()}
                            </div>
                            <div class="ecom-text-marque-wrapper" style="${n}">
                                ${this.renderChildren()}
                            </div>
                            <div class="ecom-text-marque-wrapper" style="${n}">
                                ${this.renderChildren()}
                            </div>
                            <div class="ecom-text-marque-wrapper" style="${n}">
                                ${this.renderChildren()}
                            </div>
                            <div class="ecom-text-marque-wrapper" style="${n}">
                                ${this.renderChildren()}
                            </div>
                            <div class="ecom-text-marque-wrapper" style="${n}">
                                ${this.renderChildren()}
                            </div>
                        </div>
                    `;this.innerHTML=s,this.rootRef=this.querySelector(".ecom-text-marquee-container"),this.marqueeRef=this.querySelector(".ecom-text-marque-wrapper")}calculateWidth(){const o=this.rootRef.getBoundingClientRect(),n=this.marqueeRef.getBoundingClientRect();this.containerWidth=o.width>o.height?o.width:o.height,this.marqueeWidth=n.width>n.height?n.width:n.height,this.multiplier=this.autoFillProp&&this.containerWidth&&this.marqueeWidth?Math.ceil(this.containerWidth/this.marqueeWidth):1}calculateDuration(){this.autoFillProp?this.duration=this.marqueeWidth*this.multiplier/this.speedProp:this.duration=this.marqueeWidth<this.containerWidth?this.containerWidth/this.speedProp:this.marqueeWidth/this.speedProp,this.render()}renderChildren(){let o="";for(let n=0;n<this.multiplier;n++)o+=`<div class="ecom-text-marquee-child" style="display: flex">${this.childrenHtml}</div>`;return o}addEventListeners(){this.pauseOnHoverProp&&(this.rootRef.addEventListener("mouseenter",()=>{this.playProp=!1}),this.rootRef.addEventListener("mouseleave",()=>{this.playProp=!0})),this.pauseOnClickProp&&this.rootRef.addEventListener("click",()=>{this.playProp=!this.playProp}),this.marqueeRef.addEventListener("animationiteration",()=>{typeof this.onCycleComplete=="function"&&this.onCycleComplete()}),this.marqueeRef.addEventListener("animationend",()=>{typeof this.onFinish=="function"&&this.onFinish()})}handle(){const o=this;this.duration?clearInterval(o.interval):(o.calculateWidth(),o.calculateDuration(),o.addEventListeners(),o.classList.add("show"))}}customElements.get("ecom-marquee-component")||customElements.define("ecom-marquee-component",i)

                    });
                    
                        document.querySelectorAll('.ecom-s6ta25agz2s').forEach(function(el){
                            Func.call({$el: el, id: 'ecom-s6ta25agz2s', settings: {},isLive: true});
                        });
                    

                })();
            
                (function(){
                    const Func = (function() {
                        'use strict';
window.__ectimmers = window.__ectimmers ||{};window.__ectimmers["ecom-pf3z2tsf968"]=  window.__ectimmers["ecom-pf3z2tsf968"] || {};
const e=this.$el,i=this.isLive;if(window.EComCountdown){let k=function($,S,C){let L="expires="+C.toUTCString();document.cookie=$+"="+S+";"+L+";path=/"},z=function($){let S=$+"=",L=decodeURIComponent(document.cookie).split(";");for(let T=0;T<L.length;T++){let F=L[T];for(;F.charAt(0)==" ";)F=F.substring(1);if(F.indexOf(S)==0)return F.substring(S.length,F.length)}return""},x=function($){const[S,C,L]=$.split(":"),T=S*24*60*60*1e3,F=C*60*60*1e3,P=L*60*1e3;return T+F+P},w=function($,S,C){let L=z(c),T=L?JSON.parse(L):"";!i||($==="hideTimer"?S.style.display="none":$==="hideSection"?i&&(S.closest(".ecom-section").style.display="none"):$==="redirect"?C?T!=null&&T.redirect_url&&(window.location.href=T.redirect_url):f&&(window.location.href=f):$==="toast"&&v&&(C?T.messages&&EComposer.showToast(T.messages):EComposer.showToast(v)))};const o=e.querySelector(".ecom-element__countdown--time");let n=e.querySelector(".ecom-countdown-progress-bar"),s=e.querySelector(".ecom-countdown-progress-bar--timer"),a=o?o.dataset.countdownFrom:0,r=o&&o.dataset.countdownType?o.dataset.countdownType:"visit",l=o&&o.dataset.countdownRestart?o.dataset.countdownRestart:!1,c="ecomposer_evergreen",d=z(c);d&&JSON.parse(d);let m=o.dataset.countdownTo;const h=o.dataset.evergreenRestart?JSON.parse(o.dataset.evergreenRestart):"",_=h?h.type:"",b=o.dataset.evergreenExpiryActions?o.dataset.evergreenExpiryActions:"",f=o.dataset.evergreenRedirectUrl?o.dataset.evergreenRedirectUrl:"",v=o.dataset.evergreenActionMessages?o.dataset.evergreenActionMessages:"";if(o&&o.dataset.evergreenCdTime&&o.dataset.countdownType==="evergreen"){const $=new Date().getTime();m=new Date($+x(o.dataset.evergreenCdTime))}if(o&&m){let L=function(T){if(this.innerHTML=T.strftime(t),n&&a){let F=new Date().getTime(),P=new Date(a),B=P.getTime(),D=T.finalDate.getTime();if(B<F&&D>B){n.style.display="inherit";let V=D-B,U=D-F,N=Math.round(U*100/V);s.style.width=N+"%"}else n.style.display="none"}};const $=o.dataset.showFields?o.dataset.showFields:"",S=o.dataset;var t="";const C=/\[([^\]]+)\]/gm;if($.includes("week")&&S.transWeek.length>0){let T="",F=S.transWeek.replace(C,(...P)=>(T=P[1],""));t+=`
                                        <div class="ecom-element__countdown-item--weeks">
                                            <span class="ecom-element__countdown-number">${T}</span>
                                            <span class="ecom-element__countdown-text">
                                                 ${F}
                                            </span>
                                        </div>`}if($.includes("day")&&S.transDay.length>0){let T="",F=S.transDay.replace(C,(...P)=>(T=P[1],""));t+=`
                                        <div class="ecom-element__countdown-item--days">
                                            <span class="ecom-element__countdown-number">
                                                ${T}
                                            </span>
                                            <span class="ecom-element__countdown-text">
                                                ${F}
                                            </span>
                                        </div>`}if($.includes("hour")&&S.transHour.length>0){let T="",F=S.transHour.replace(C,(...P)=>(T=P[1],""));t+=`
                                        <div class="ecom-element__countdown-item--hours">
                                            <span class="ecom-element__countdown-number">
                                                 ${T}
                                            </span>
                                            <span class="ecom-element__countdown-text">
                                                ${F}
                                            </span>
                                        </div>`}if($.includes("minute")&&S.transMinute.length>0){let T="",F=S.transMinute.replace(C,(...P)=>(T=P[1],""));t+=`
                                        <div class="ecom-element__countdown-item--minutes">
                                            <span class="ecom-element__countdown-number">
                                                ${T}
                                            </span>
                                            <span class="ecom-element__countdown-text">
                                                ${F}
                                            </span>
                                        </div>`}if($.includes("second")&&S.transSecond.length>0){let T="",F=S.transSecond.replace(C,(...P)=>(T=P[1],""));t+=`
                                        <div class="ecom-element__countdown-item--seconds">
                                            <span class="ecom-element__countdown-number">
                                                ${T}
                                            </span>
                                            <span class="ecom-element__countdown-text">
                                                ${F}
                                            </span>
                                    </div>`}if(!(a&&new Date().getTime()<new Date(a).getTime()&&r=="time")){let T=new Date(m);if(window.EComCountdown){if(r==="evergreen"){let B=z(c),D=B?JSON.parse(B):"";if(_!=="nextVisit"&&_!=="immediately"){const V=o.dataset.evergreenVersion?o.dataset.evergreenVersion:"";let U={action:o.dataset.evergreenExpiryActions?o.dataset.evergreenExpiryActions:"",evergreen_ver:V,creation_date:new Date,countdown_time:m,expiration_date:"",redirect_url:f,messages:v};if(typeof D=="object"&&D.evergreen_ver&&D.evergreen_ver===V){let N=new Date,O=new Date(D.countdown_time);if(O>N)T=O,a=D.creation_date?D.creation_date:0;else{e.style.display="none",w(D.action,e,!0);return}}else if(_==="specificTime"){const N=new Date;a=N;let O=typeof x(h.data)=="number"?new Date(N.getTime()+x(h.data)):0;U.expiration_date=O,k(c,JSON.stringify(U),O)}else if(_==="none"){const N=new Date;a=N;let O=new Date(N);O.setDate(N.getDate()+365),U.expiration_date=O,k(c,JSON.stringify(U),O)}}else a=new Date}let F=new Date(m).getTime()-new Date(o.dataset.countdownFrom).getTime(),P=new Date(m).getTime()+F;if(F==0)return;for(;P<new Date().getTime();)P+=F;window.EComCountdown(o,T,{}),o.addEventListener("update.ecom.countdown",L),o.addEventListener("finish.ecom.countdown",function(B){if(l=="true"&&r=="time"&&window.EComCountdown(o,new Date(P),L),r==="evergreen")if(_==="none"||_==="specificTime"){let D=z(c),V=D?JSON.parse(D):"";w(V.action,e,!0)}else if(_==="immediately"&&h.data){let D=x(o.dataset.evergreenCdTime);if(typeof D=="number"&&D>0){let V=new Date().getTime();a=new Date,w(b,e),window.EComCountdown(o,new Date(V+D),L)}}else _==="nextVisit"&&w(b,e)})}}}}

                    });
                    
                        document.querySelectorAll('.ecom-pf3z2tsf968').forEach(function(el){
                            Func.call({$el: el, id: 'ecom-pf3z2tsf968', settings: {},isLive: true});
                        });
                    

                })();
            
                (function(){
                    const Func = (function() {
                        'use strict';
window.__ectimmers = window.__ectimmers ||{};window.__ectimmers["ecom-4g6w2jk34kh"]=  window.__ectimmers["ecom-4g6w2jk34kh"] || {};
if(this.settings.link==="lightbox"&&this.settings.lightbox==="yes"&&window.EComModal&&this.$el){var e=this.$el.querySelector("[ecom-modal]");new window.EComModal(e,{cssClass:["ecom-container-lightbox-"+this.id]})}let i=this.$el;if(!i)return;function t(n){const s=n.getBoundingClientRect();return s.top>=0&&s.left>=0&&s.bottom-n.offsetHeight/2<=(window.innerHeight||document.documentElement.clientHeight)&&s.right<=(window.innerWidth||document.documentElement.clientWidth)}function o(){let n=i.querySelector(".ecom-element.ecom-base-image"),s=i.closest(".core__row--columns");n&&(t(n)?(n.classList.add("image-highlight"),s.setAttribute("style","z-index: unset")):(n.classList.remove("image-highlight"),s.setAttribute("style","z-index: 1")))}this.settings.highligh_on_viewport&&window.addEventListener("scroll",function(){o()})

                    });
                    
                        document.querySelectorAll('.ecom-4g6w2jk34kh').forEach(function(el){
                            Func.call({$el: el, id: 'ecom-4g6w2jk34kh', settings: {"link":"lightbox","lightbox":"no","highligh_on_viewport":false},isLive: true});
                        });
                    
                        document.querySelectorAll('.ecom-vdkw0rypyqm').forEach(function(el){
                            Func.call({$el: el, id: 'ecom-vdkw0rypyqm', settings: {"link":"none","lightbox":"no","highligh_on_viewport":false},isLive: true});
                        });
                    
                        document.querySelectorAll('.ecom-dcjf7ipa4lg').forEach(function(el){
                            Func.call({$el: el, id: 'ecom-dcjf7ipa4lg', settings: {"link":"none","lightbox":"no","highligh_on_viewport":false},isLive: true});
                        });
                    

                })();
            
;try{
 
} catch(error){console.error(error);}