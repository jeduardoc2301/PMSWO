const hex2=(h)=>{h=h.replace('#','');return[0,2,4].map(i=>parseInt(h.slice(i,i+2),16))}
const s2l=(c)=>{c/=255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4}
const L=(h)=>{const[r,g,b]=hex2(h);return 0.2126*s2l(r)+0.7152*s2l(g)+0.0722*s2l(b)}
const cr=(a,b)=>{const x=L(a),y=L(b);const[hi,lo]=x>y?[x,y]:[y,x];return (hi+0.05)/(lo+0.05)}
const to=(n)=>Math.round(n).toString(16).padStart(2,'0')
const over=(fg,a,bg)=>{const F=hex2(fg),B=hex2(bg);return '#'+[0,1,2].map(i=>to(F[i]*a+B[i]*(1-a))).join('')}
const f=(n)=>n.toFixed(2)
const OSC='#18181b', CLA='#ffffff'
const TINTA_OSC='#fafafa', TINTA_CLA='#18181b'
console.log('=== 1. rampa actual, orden vacio->lleno ===')
const ACT=['#184f95','#2a78d6','#6da7ec','#b7d3f6']
for(const [surf,ink,nm] of [[OSC,TINTA_OSC,'oscuro'],[CLA,TINTA_CLA,'claro']]){
  console.log(` -- ${nm} surf=${surf} tinta=${ink}`)
  ACT.forEach((c,i)=>console.log(`   ocup${['<33','33-66','66-99','>=99'][i]}  ${c}  cr(surf)=${f(cr(c,surf))}  cr(tinta)=${f(cr(ink,c))}`))
}
console.log('=== 2. velo de sobrecarga ===')
for(const [bg,nm] of [[OSC,'oscuro'],[CLA,'claro']]){
  for(const [hexc,al,et] of [['#d03b3b',0x44,'d03b3b@44']]){
    const c=over(hexc,al/255,bg)
    console.log(` ${nm}: ${et} sobre ${bg} => ${c}   velo-vs-superficie=${f(cr(c,bg))}  texto#d03b3b=${f(cr('#d03b3b',c))}  texto#f87171=${f(cr('#f87171',c))}  texto#991b1b=${f(cr('#991b1b',c))}  texto#7f1d1d=${f(cr('#7f1d1d',c))}`)
  }
}
console.log('=== 3. candidatas velo claro ===')
for(const al of [0x22,0x2b,0x33,0x3d,0x44,0x55,0x66]){
  const c=over('#d03b3b',al/255,CLA)
  console.log(`  #d03b3b@${al.toString(16)} sobre blanco => ${c}  velo=${f(cr(c,CLA))}  txt#7f1d1d=${f(cr('#7f1d1d',c))}  txt#991b1b=${f(cr('#991b1b',c))}  txt#18181b=${f(cr('#18181b',c))}`)
}
console.log('=== 4. candidatas rampa clara (lleno = mas oscuro) ===')
const CANDS={
 'RAMPA_AZUL directa':['#b7d3f6','#6da7ec','#2a78d6','#184f95'],
 'tres claros + 2a78d6':['#dbe9fb','#a9cbf3','#6da7ec','#2a78d6'],
 'propuesta A':['#d6e6fa','#9ec6f2','#5f9be4','#2f6fbf'],
 'propuesta B':['#dceafb','#a8caf3','#6ea6e8','#3f7fc9'],
}
for(const [nm,pal] of Object.entries(CANDS)){
  console.log(` ${nm}`)
  pal.forEach((c,i)=>console.log(`   paso${i} ${c}  cr(#fff)=${f(cr(c,CLA))}  cr(tinta #18181b)=${f(cr(TINTA_CLA,c))}`))
}
