import sharp from 'sharp';
const src='public/logo.jpeg';
async function make(size, file, pad=0.12){
  const inner=Math.round(size*(1-pad*2));
  const logo=await sharp(src).resize(inner, inner, {fit:'contain', background:'#ffffff'}).toBuffer();
  await sharp({create:{width:size,height:size,channels:4,background:'#ffffff'}})
    .composite([{input:logo, gravity:'center'}])
    .png().toFile('public/'+file);
  console.log('  '+file+' ('+size+')');
}
console.log('Generando iconos cuadrados:');
await make(512,'pwa-512.png');
await make(192,'pwa-192.png');
await make(180,'apple-touch-icon.png',0.08);
await make(64,'favicon.png',0.06);
