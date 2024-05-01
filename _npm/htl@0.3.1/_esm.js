/**
 * Bundled by jsDelivr using Rollup v2.79.1 and Terser v5.19.2.
 * Original file: /npm/htl@0.3.1/src/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
function e(e){const t=document.createElement("template");return t.innerHTML=e,document.importNode(t.content,!0)}function t(e){const t=document.createElementNS("http://www.w3.org/2000/svg","g");return t.innerHTML=e,t}const r=Object.assign(oe(e,(e=>{if(null===e.firstChild)return null;if(e.firstChild===e.lastChild)return e.removeChild(e.firstChild);const t=document.createElement("span");return t.appendChild(e),t})),{fragment:oe(e,(e=>e))}),n=Object.assign(oe(t,(e=>null===e.firstChild?null:e.firstChild===e.lastChild?e.removeChild(e.firstChild):e)),{fragment:oe(t,(e=>{const t=document.createDocumentFragment();for(;e.firstChild;)t.appendChild(e.firstChild);return t}))}),a=9,s=10,i=12,o=13,c=32,l=65,f=90,u=97,d=122,p=60,k=62,b=47,h=45,g=33,m=61,w=34,C=39,x=63,v=1,y=2,A=3,N=4,L=5,T=6,S=7,U=8,$=9,E=10,M=11,B=12,O=13,P=14,R=15,j=16,q=17,H=18,X=19,D=20,F=21,W=22,Y=23,I=24,z=25,V=26,Z=27,G=28,J=29,K=128,Q=1,_=8,ee=1,te="http://www.w3.org/2000/svg",re="http://www.w3.org/1999/xlink",ne="http://www.w3.org/XML/1998/namespace",ae="http://www.w3.org/2000/xmlns/",se=new Map(["attributeName","attributeType","baseFrequency","baseProfile","calcMode","clipPathUnits","diffuseConstant","edgeMode","filterUnits","glyphRef","gradientTransform","gradientUnits","kernelMatrix","kernelUnitLength","keyPoints","keySplines","keyTimes","lengthAdjust","limitingConeAngle","markerHeight","markerUnits","markerWidth","maskContentUnits","maskUnits","numOctaves","pathLength","patternContentUnits","patternTransform","patternUnits","pointsAtX","pointsAtY","pointsAtZ","preserveAlpha","preserveAspectRatio","primitiveUnits","refX","refY","repeatCount","repeatDur","requiredExtensions","requiredFeatures","specularConstant","specularExponent","spreadMethod","startOffset","stdDeviation","stitchTiles","surfaceScale","systemLanguage","tableValues","targetX","targetY","textLength","viewBox","viewTarget","xChannelSelector","yChannelSelector","zoomAndPan"].map((e=>[e.toLowerCase(),e]))),ie=new Map([["xlink:actuate",re],["xlink:arcrole",re],["xlink:href",re],["xlink:role",re],["xlink:show",re],["xlink:title",re],["xlink:type",re],["xml:lang",ne],["xml:space",ne],["xmlns",ae],["xmlns:xlink",ae]]);function oe(e,t){return function({raw:r}){let n,a,s,i,o=v,c="",l=0;for(let e=0,t=arguments.length;e<t;++e){const t=r[e];if(e>0){const n=arguments[e];switch(o){case V:if(null!=n){const e=`${n}`;if(pe(a))c+=e.replace(/[<]/g,ce);else{if(new RegExp(`</${a}[\\s>/]`,"i").test(c.slice(-a.length-2)+e))throw new Error("unsafe raw text");c+=e}}break;case v:null==n||(n instanceof Node||"string"!=typeof n&&n[Symbol.iterator]||/(?:^|>)$/.test(r[e-1])&&/^(?:<|$)/.test(t)?(c+="\x3c!--::"+e+"--\x3e",l|=K):c+=`${n}`.replace(/[<&]/g,ce));break;case $:{let a;if(o=B,/^[\s>]/.test(t)){if(null==n||!1===n){c=c.slice(0,s-r[e-1].length);break}if(!0===n||""==(a=`${n}`)){c+="''";break}if("style"===r[e-1].slice(s,i)&&ue(n)||"function"==typeof n){c+="::"+e,l|=Q;break}}if(void 0===a&&(a=`${n}`),""===a)throw new Error("unsafe unquoted empty string");c+=a.replace(/^['"]|[\s>&]/g,ce);break}case B:c+=`${n}`.replace(/[\s>&]/g,ce);break;case M:c+=`${n}`.replace(/['&]/g,ce);break;case E:c+=`${n}`.replace(/["&]/g,ce);break;case T:if(ue(n)){c+="::"+e+"=''",l|=Q;break}throw new Error("invalid binding");case q:break;default:throw new Error("invalid binding")}}for(let e=0,r=t.length;e<r;++e){const r=t.charCodeAt(e);switch(o){case v:r===p&&(o=y);break;case y:r===g?o=z:r===b?o=A:le(r)?(n=e,a=void 0,o=N,--e):r===x?(o=L,--e):(o=v,--e);break;case A:le(r)?(o=N,--e):r===k?o=v:(o=L,--e);break;case N:fe(r)?(o=T,a=ke(t,n,e)):r===b?o=P:r===k&&(a=ke(t,n,e),o=de(a)?V:v);break;case T:fe(r)||(r===b||r===k?(o=S,--e):r===m?(o=U,s=e+1,i=void 0):(o=U,--e,s=e+1,i=void 0));break;case U:fe(r)||r===b||r===k?(o=S,--e,i=e):r===m&&(o=$,i=e);break;case S:fe(r)||(r===b?o=P:r===m?o=$:r===k?o=de(a)?V:v:(o=U,--e,s=e+1,i=void 0));break;case $:fe(r)||(r===w?o=E:r===C?o=M:r===k?o=de(a)?V:v:(o=B,--e));break;case E:r===w&&(o=O);break;case M:r===C&&(o=O);break;case B:fe(r)?o=T:r===k&&(o=de(a)?V:v);break;case O:fe(r)?o=T:r===b?o=P:r===k?o=de(a)?V:v:(o=T,--e);break;case P:r===k?o=v:(o=T,--e);break;case L:r===k&&(o=v);break;case R:r===h?o=j:r===k?o=v:(o=q,--e);break;case j:r===h?o=Y:r===k?o=v:(o=q,--e);break;case q:r===p?o=H:r===h&&(o=W);break;case H:r===g?o=X:r!==p&&(o=q,--e);break;case X:r===h?o=D:(o=q,--e);break;case D:r===h?o=F:(o=Y,--e);break;case F:o=Y,--e;break;case W:r===h?o=Y:(o=q,--e);break;case Y:r===k?o=v:r===g?o=I:r!==h&&(o=q,--e);break;case I:r===h?o=W:r===k?o=v:(o=q,--e);break;case z:r===h&&t.charCodeAt(e+1)===h?(o=R,++e):(o=L,--e);break;case V:r===p&&(o=Z);break;case Z:r===b?o=G:(o=V,--e);break;case G:le(r)?(n=e,o=J,--e):(o=V,--e);break;case J:fe(r)&&a===ke(t,n,e)?o=T:r===b&&a===ke(t,n,e)?o=P:r===k&&a===ke(t,n,e)?o=v:le(r)||(o=V,--e);break;default:o=void 0}}c+=t}const f=e(c),u=document.createTreeWalker(f,l,null,!1),d=[];for(;u.nextNode();){const e=u.currentNode;switch(e.nodeType){case ee:{const t=e.attributes;for(let r=0,n=t.length;r<n;++r){const{name:a,value:s}=t[r];if(/^::/.test(a)){const t=arguments[+a.slice(2)];he(e,a),--r,--n;for(const r in t){const n=t[r];null==n||!1===n||("function"==typeof n?e[r]=n:"style"===r&&ue(n)?ge(e[r],n):be(e,r,!0===n?"":n))}}else if(/^::/.test(s)){const t=arguments[+s.slice(2)];he(e,a),--r,--n,"function"==typeof t?e[a]=t:ge(e[a],t)}}break}case _:if(/^::/.test(e.data)){const t=e.parentNode,r=arguments[+e.data.slice(2)];if(r instanceof Node)t.insertBefore(r,e);else if("string"!=typeof r&&r[Symbol.iterator])if(r instanceof NodeList||r instanceof HTMLCollection)for(let n=r.length-1,a=e;n>=0;--n)a=t.insertBefore(r[n],a);else for(const n of r)null!=n&&t.insertBefore(n instanceof Node?n:document.createTextNode(n),e);else t.insertBefore(document.createTextNode(r),e);d.push(e)}}}for(const e of d)e.parentNode.removeChild(e);return t(f)}}function ce(e){return`&#${e.charCodeAt(0).toString()};`}function le(e){return l<=e&&e<=f||u<=e&&e<=d}function fe(e){return e===a||e===s||e===i||e===c||e===o}function ue(e){return e&&e.toString===Object.prototype.toString}function de(e){return"script"===e||"style"===e||pe(e)}function pe(e){return"textarea"===e||"title"===e}function ke(e,t,r){return e.slice(t,r).toLowerCase()}function be(e,t,r){e.namespaceURI===te&&(t=t.toLowerCase(),t=se.get(t)||t,ie.has(t))?e.setAttributeNS(ie.get(t),t,r):e.setAttribute(t,r)}function he(e,t){e.namespaceURI===te&&(t=t.toLowerCase(),t=se.get(t)||t,ie.has(t))?e.removeAttributeNS(ie.get(t),t):e.removeAttribute(t)}function ge(e,t){for(const r in t){const n=t[r];r.startsWith("--")?e.setProperty(r,n):e[r]=n}}export{r as html,n as svg};export default null;