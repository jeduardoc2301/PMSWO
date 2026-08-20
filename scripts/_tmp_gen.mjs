const s2lin=(c)=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4
const lin2s=(c)=>{c=Math.max(0,Math.min(1,c));return c<=0.0031308?12.92*c:1.055*c**(1/2.4)-0.055}
const hex2srgb=(h)=>{h=h.trim().replace(/^#/,'');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255)}
const lin=(h)=>hex2srgb(h).map(s2lin)
const relLum=(h)=>{const[r,g,b]=lin(h);return 0.2126*r+0.7152*g+0.0722*b}
const cr=(a,b)=>{const[hi,lo]=[relLum(a),relLum(b)].sort((x,y)=>y-x);return (hi+0.05)/(lo+0.05)}
function oklabFromLin([r,g,b]){const l=Math.cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b),m=Math.cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b),s=Math.cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b);return[0.2104542553*l+0.7936177850*m-0.0040720468*s,1.9779984951*l-2.4285922050*m+0.4505937099*s,0.0259040371*l+0.7827717662*m-0.8086757660*s]}
function linFromOklab([L,a,b]){const l=(L+0.3963377774*a+0.2158037573*b)**3,m=(L-0.1055613458*a-0.0638541728*b)**3,s=(L-0.0894841775*a-1.2914855480*b)**3;return[4.0767416621*l-3.3077115913*m+0.2309699292*s,-1.2684380046*l+2.6097574011*m-0.3413193965*s,-0.0041960863*l-0.7034186147*m+1.7076147010*s]}
const oklch=(h)=>{const[L,a,b]=oklabFromLin(lin(h));return[L,Math.hypot(a,b),((Math.atan2(b,a)*180/Math.PI)%360+360)%360]}
const inG=(rgb)=>rgb.every(c=>c>=-0.0005&&c<=1.0005)
function lchHex(L,C,hd){const r=hd*Math.PI/180;let lo=0,hi=C
 if(inG(linFromOklab([L,C*Math.cos(r),C*Math.sin(r)])))lo=C;else{for(let i=0;i<40;i++){const m=(lo+hi)/2;if(inG(linFromOklab([L,m*Math.cos(r),m*Math.sin(r)])))lo=m;else hi=m}}
 return '#'+linFromOklab([L,lo*Math.cos(r),lo*Math.sin(r)]).map(c=>Math.round(Math.max(0,Math.min(1,lin2s(c)))*255).toString(16).padStart(2,'0')).join('')}
const [Ls,hue,Cs]=[process.argv[2].split(',').map(Number),Number(process.argv[3]),process.argv[4].split(',').map(Number)]
const pal=Ls.map((L,i)=>lchHex(L,Cs[i],hue))
console.log(pal.join(','))
pal.forEach((c,i)=>{const[L,C,H]=oklch(c);console.log(`  ${c} OKL=${L.toFixed(3)} C=${C.toFixed(3)} h=${H.toFixed(0)}  cr(#fff)=${cr(c,'#ffffff').toFixed(2)}  cr(tinta#18181b)=${cr(c,'#18181b').toFixed(2)}`)})
for(let i=0;i<pal.length-1;i++)console.log(`   dL ${pal[i]}->${pal[i+1]} = ${Math.abs(oklch(pal[i])[0]-oklch(pal[i+1])[0]).toFixed(3)}`)
