const hex2=(h)=>{h=h.replace('#','');return[0,2,4].map(i=>parseInt(h.slice(i,i+2),16))}
const s2l=(c)=>{c/=255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4}
const L=(h)=>{const[r,g,b]=hex2(h);return 0.2126*s2l(r)+0.7152*s2l(g)+0.0722*s2l(b)}
const cr=(a,b)=>{const x=L(a),y=L(b);const[hi,lo]=x>y?[x,y]:[y,x];return (hi+0.05)/(lo+0.05)}
const to=(n)=>Math.round(n).toString(16).padStart(2,'0')
const over=(fg,a,bg)=>{const F=hex2(fg),B=hex2(bg);return '#'+[0,1,2].map(i=>to(F[i]*a+B[i]*(1-a))).join('')}
const f=(n)=>n.toFixed(2)
console.log('=== velo #b91c1c sobre #ffffff ===')
for(const al of [0x22,0x2b,0x33,0x3d,0x44,0x4d,0x55]){
  const c=over('#b91c1c',al/255,'#ffffff')
  console.log(` @${al.toString(16)} => ${c}  velo-vs-#fff=${f(cr(c,'#ffffff'))}  txt#b91c1c=${f(cr('#b91c1c',c))}  txt#18181b=${f(cr('#18181b',c))}`)
}
console.log('=== control: velo oscuro #d03b3b@44 sobre #18181b con tinta #f87171 ===')
const d=over('#d03b3b',0x44/255,'#18181b')
console.log(` ${d}  velo=${f(cr(d,'#18181b'))}  txt#f87171=${f(cr('#f87171',d))}  txt#d03b3b=${f(cr('#d03b3b',d))}`)
console.log('=== rampa clara propuesta vs superficie y vs tinta ===')
const P=['#bed8fa','#8fbefa','#63a2f2','#4087de']
P.forEach((c,i)=>console.log(`  paso${i} ${c}  cr(#fff)=${f(cr(c,'#ffffff'))}  cr(#18181b)=${f(cr('#18181b',c))}`))
console.log('=== velo elegido vs cada paso de la rampa clara (que no se confunda con "muy lleno") ===')
const V=over('#b91c1c',0x33/255,'#ffffff')
P.forEach((c,i)=>console.log(`  velo ${V} vs paso${i} ${c}: cr=${f(cr(V,c))}`))
