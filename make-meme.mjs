import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const W = 1024, H = 1024;
const inputPath = path.join(process.cwd(), 'assets', 'mark-1024.png');
const outputPath = path.join(process.cwd(), 'meme.png');

function decodePng(file) {
  const b = fs.readFileSync(file);
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  if (!b.subarray(0, 8).equals(sig)) throw new Error('Input is not a PNG');
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idats = [];
  while (pos < b.length) {
    const n = b.readUInt32BE(pos); pos += 4;
    const type = b.toString('ascii', pos, pos + 4); pos += 4;
    const data = b.subarray(pos, pos + n); pos += n;
    pos += 4;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') break;
  }
  if (width !== 1024 || height !== 1024 || bitDepth !== 8 || colorType !== 6 || interlace !== 0) throw new Error('Expected non-interlaced 1024x1024 8-bit RGBA PNG');
  const packed = zlib.inflateSync(Buffer.concat(idats));
  const stride = width * 4, raw = Buffer.alloc(height * stride);
  const paeth = (a, c, d) => {
    const p = a + c - d, pa = Math.abs(p-a), pc = Math.abs(p-c), pd = Math.abs(p-d);
    return pa <= pc && pa <= pd ? a : pc <= pd ? c : d;
  };
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = packed[src++], row = y * stride, prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const v = packed[src++], a = x >= 4 ? raw[row + x - 4] : 0;
      const c = y ? raw[prev + x] : 0, d = y && x >= 4 ? raw[prev + x - 4] : 0;
      let q = v;
      if (filter === 1) q += a;
      else if (filter === 2) q += c;
      else if (filter === 3) q += Math.floor((a + c) / 2);
      else if (filter === 4) q += paeth(a, c, d);
      else if (filter !== 0) throw new Error('Unsupported PNG filter');
      raw[row + x] = q & 255;
    }
  }
  return { width, height, pixels: raw };
}

const canvas = Buffer.alloc(W * H * 4);
const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
function pixel(x, y, r, g, b, a = 255) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= W || y < 0 || y >= H || a <= 0) return;
  const i = (y * W + x) * 4, sa = a / 255, da = canvas[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (!oa) return;
  canvas[i] = clamp((r * sa + canvas[i] * da * (1-sa)) / oa);
  canvas[i+1] = clamp((g * sa + canvas[i+1] * da * (1-sa)) / oa);
  canvas[i+2] = clamp((b * sa + canvas[i+2] * da * (1-sa)) / oa);
  canvas[i+3] = clamp(oa * 255);
}
function rect(x, y, w, h, col, alpha = 255) {
  const x0 = Math.max(0, Math.floor(x)), x1 = Math.min(W, Math.ceil(x+w));
  const y0 = Math.max(0, Math.floor(y)), y1 = Math.min(H, Math.ceil(y+h));
  for (let yy=y0; yy<y1; yy++) for (let xx=x0; xx<x1; xx++) pixel(xx, yy, col[0], col[1], col[2], alpha);
}
function circle(cx, cy, rx, ry, col, alpha = 255) {
  const x0=Math.max(0,Math.floor(cx-rx)), x1=Math.min(W-1,Math.ceil(cx+rx));
  const y0=Math.max(0,Math.floor(cy-ry)), y1=Math.min(H-1,Math.ceil(cy+ry));
  for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) {
    const dx=(x-cx)/rx, dy=(y-cy)/ry;
    if(dx*dx+dy*dy<=1) pixel(x,y,col[0],col[1],col[2],alpha);
  }
}
function line(x0,y0,x1,y1,width,col,alpha=255) {
  const dx=x1-x0,dy=y1-y0,steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))));
  for(let i=0;i<=steps;i++){const t=i/steps;circle(x0+dx*t,y0+dy*t,width/2,width/2,col,alpha);}
}
function mix(a,b,t){return a.map((v,i)=>v+(b[i]-v)*t);}
function skyColor(y) {
  const stops=[[0,[31,15,76]],[190,[84,30,130]],[390,[179,40,139]],[540,[239,91,117]],[640,[255,165,90]]];
  for(let i=0;i<stops.length-1;i++) if(y<=stops[i+1][0]) return mix(stops[i][1],stops[i+1][1],(y-stops[i][0])/(stops[i+1][0]-stops[i][0])).map(clamp);
  return stops.at(-1)[1];
}
function gradientRect(x,y,w,h,colorAt) { for(let yy=Math.max(0,y);yy<Math.min(H,y+h);yy++) rect(x,yy,w,1,colorAt(yy)); }
let seed=0x4d595df4;
function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}

// Sky and scattered stars.
gradientRect(0,0,W,640,skyColor);
for(let i=0;i<75;i++){const x=Math.floor(rand()*W),y=Math.floor(rand()*300),s=rand()<.82?1:2;circle(x,y,s,s,[255,225,230],Math.floor(100+rand()*155));}
// Distant sun, with transparent-looking cuts painted in the sky color.
const sunStops=[[0,[255,240,72]],[.48,[255,155,48]],[1,[255,57,126]]];
function sunColor(y){const t=Math.max(0,Math.min(1,(y-250)/500));const k=t<.48?0:1,u=t<.48?t/.48:(t-.48)/.52;return mix(sunStops[k][1],sunStops[k+1][1],u).map(clamp);}
for(let y=250;y<=750;y++) for(let x=262;x<=762;x++){const dx=x-512,dy=y-500;if(dx*dx+dy*dy<=250*250){const c=sunColor(y);pixel(x,y,...c);}}
for(let y=500;y<744;){const thick=Math.min(30,3+Math.floor((y-500)/12));for(let yy=y;yy<y+thick;yy++)rect(262,yy,500,1,skyColor(yy));y+=thick+Math.max(8,19-Math.floor((y-500)/24));}
// Skyline silhouette.
let bx=-8;
while(bx<W){const bw=40+Math.floor(rand()*71), bh=60+Math.floor(rand()*161), top=640-bh;
  rect(bx,top,bw,bh,[22,20,65]);
  if(rand()<.55){const rows=Math.floor(bh/25),cols=Math.floor(bw/18);for(let ry=0;ry<rows;ry++)for(let cx=0;cx<cols;cx++)if(rand()<.24)rect(bx+6+cx*17,top+9+ry*22,5,8,[255,211,122],185);}
  bx+=bw+3+Math.floor(rand()*8);
}
// Asphalt and low neon reflections.
rect(0,640,W,384,[24,10,43]);
gradientRect(0,640,W,88,y=>mix([255,64,150],[24,10,43],(y-640)/88).map(clamp));
for(let i=0;i<34;i++){const y=680+rand()*130,x=rand()*W,w=30+rand()*220;line(x,y,x+w,y,1+rand()*4,rand()<.55?[255,54,168]:[35,205,237],Math.floor(20+rand()*40));}
for(let y=706;y<815;){const scale=.55+(y-706)/318, dash=Math.min(28*scale,815-y),gap=34*scale;rect(506,y,12*scale,dash,[255,229,169],175);y+=dash+gap;}
// Edge palms: segmented trunks and tapered fronds.
function palm(baseX,baseY,crownX,crownY,mirror){const dark=[13,8,28];let px=baseX,py=baseY;
  for(let i=1;i<=12;i++){const t=i/12,nx=baseX+(crownX-baseX)*t+mirror*5*Math.sin(t*Math.PI),ny=baseY+(crownY-baseY)*t;line(px,py,nx,ny,17-9*t,dark);px=nx;py=ny;}
  for(let j=0;j<7;j++){const a=(-Math.PI+Math.PI*j/6),length=150+40*Math.sin((j+1)*Math.PI/8);
    const ex=crownX+mirror*Math.cos(a)*length,ey=crownY+Math.sin(a)*length*.38;
    const cx=crownX+mirror*Math.cos(a)*length*.55,cy=crownY-length*.78;
    let lx=crownX,ly=crownY;for(let k=1;k<=12;k++){const t=k/12,u=1-t,nx=u*u*crownX+2*u*t*cx+t*t*ex,ny=u*u*crownY+2*u*t*cy+t*t*ey;line(lx,ly,nx,ny,9-7*t,dark);lx=nx;ly=ny;}
  }
}
palm(55,1005,105,625,1);palm(969,1005,919,625,-1);
// Soft ground shadow.
circle(512,812,215,26,[0,0,0],105);

// Key and scale supplied circular mark, preserving its coin detail.
const mark=decodePng(inputPath), keyed=Buffer.from(mark.pixels), center=511.5;
for(let y=0;y<mark.height;y++)for(let x=0;x<mark.width;x++){
  const i=(y*mark.width+x)*4, dx=(x-center)/1024,dy=(y-center)/1024;
  const coin=((x/1024-.755)**2+(y/1024-.43)**2)<=.13**2;
  const outside=dx*dx+dy*dy>.39**2;
  const magenta=keyed[i]>140&&keyed[i+1]<110&&keyed[i+2]>110&&keyed[i]>keyed[i+1]+60;
  if(!coin&&(outside||magenta))keyed[i+3]=0;
}
for(let dy=0;dy<500;dy++)for(let dx=0;dx<500;dx++){
  const sx=Math.min(1023,Math.floor((dx+.5)*1024/500)),sy=Math.min(1023,Math.floor((dy+.5)*1024/500)),i=(sy*1024+sx)*4;
  if(keyed[i+3])pixel(262+dx,310+dy,keyed[i],keyed[i+1],keyed[i+2],keyed[i+3]);
}
// Chunky sunglasses overlay.
const black=[11,9,24];
function roundedLens(cx,cy,w,h,r){rect(cx-w/2+r,cy-h/2,w-2*r,h,black);rect(cx-w/2,cy-h/2+r,w,h-2*r,black);circle(cx-w/2+r,cy-h/2+r,r,r,black);circle(cx+w/2-r,cy-h/2+r,r,r,black);circle(cx-w/2+r,cy+h/2-r,r,r,black);circle(cx+w/2-r,cy+h/2-r,r,r,black);}
roundedLens(470,513,96,68,15);roundedLens(554,513,96,68,15);
line(518,513,506,513,13,black);line(422,504,367,496,9,black);line(602,504,657,496,9,black);
line(451,496,478,490,3,[149,164,183],220);line(535,496,562,490,3,[149,164,183],220);

// 5x7 hand-authored bitmap typeface.
const FONT={
 A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],G:['01111','10000','10000','10111','10001','10001','01111'],H:['10001','10001','10001','11111','10001','10001','10001'],I:['11111','00100','00100','00100','00100','00100','11111'],J:['00111','00010','00010','00010','10010','10010','01100'],K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','11001','10101','10011','10011','10001'],O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],Q:['01110','10001','10001','10001','10101','10010','01101'],R:['11110','10001','10001','11110','10100','10010','10001'],S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],W:['10001','10001','10001','10101','10101','10101','01010'],X:['10001','10001','01010','00100','01010','10001','10001'],Y:['10001','10001','01010','00100','00100','00100','00100'],Z:['11111','00001','00010','00100','01000','10000','11111'],
 '0':['01110','10001','10011','10101','11001','10001','01110'],'1':['00100','01100','00100','00100','00100','00100','01110'],'2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],'4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],'6':['01110','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],'8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110'],
 ' ':['00000','00000','00000','00000','00000','00000','00000'],'+':['00000','00100','00100','11111','00100','00100','00000'],'$':['00100','01111','10100','01110','00101','11110','00100'],'!':['00100','00100','00100','00100','00100','00000','00100'],':':['00000','00100','00100','00000','00100','00100','00000'],'%':['11001','11010','00100','01000','10110','00110','00000'],'.':['00000','00000','00000','00000','00000','00110','00110'],',':['00000','00000','00000','00000','00110','00110','00100'],"'":['00100','00100','00000','00000','00000','00000','00000']
};
function textWidth(str,scale){return Math.max(0,str.length*6*scale-scale);}
function drawText(str,cx,y,scale,fill){
  str=str.toUpperCase();const total=textWidth(str,scale),left=Math.round(cx-total/2),outline=[9,7,20];
  function pass(color,ox,oy){for(let n=0;n<str.length;n++){const glyph=FONT[str[n]]||FONT[' '],gx=left+n*6*scale+ox,gy=y+oy;for(let r=0;r<7;r++)for(let c=0;c<5;c++)if(glyph[r][c]==='1')rect(gx+c*scale,gy+r*scale,scale,scale,color);}}
  const off=Math.max(1,Math.floor(scale/2));for(let oy=-off;oy<=off;oy+=off)for(let ox=-off;ox<=off;ox+=off)if(ox||oy)pass(outline,ox,oy);pass(fill,0,0);
}
function fittedScale(str,maxWidth){let s=1;while(textWidth(str,s+1)<=maxWidth)s++;return s;}
// Download progress indicator.
function roundBox(x,y,w,h,r,fill,stroke=null,sw=0){
  rect(x+r,y,w-2*r,h,fill);rect(x,y+r,r,h-2*r,fill);rect(x+w-r,y+r,r,h-2*r,fill);
  circle(x+r,y+r,r,r,fill);circle(x+w-r,y+r,r,r,fill);circle(x+r,y+h-r,r,r,fill);circle(x+w-r,y+h-r,r,r,fill);
  if(stroke){rect(x,y,w,sw,stroke);rect(x,y+h-sw,w,sw,stroke);rect(x,y,sw,h,stroke);rect(x+w-sw,y,sw,h,stroke);}
}
roundBox(212,128,600,24,7,[20,13,42],[225,231,255],2);
roundBox(215,131,70,18,5,[47,231,243]);
drawText('12%',512,158,3,[245,250,255]);
// Captions.
const top='DAY 3 OF DOWNLOADING GTA 6', bounty='BOUNTY PASSED!', reward='+$500 USDC', bottom='MY AI AGENT: ALREADY PAID';
drawText(top,512,44,fittedScale(top,940),[255,255,255]);
drawText(bounty,512,838,fittedScale(bounty,880),[255,194,43]);
drawText(reward,512,920,Math.max(1,Math.min(8,Math.floor(340/(reward.length*6-1)))),[72,255,119]);
drawText(bottom,512,964,fittedScale(bottom,920),[255,255,255]);

// PNG writer with locally computed CRC-32.
const crcTable=new Uint32Array(256);
for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);crcTable[n]=c>>>0;}
function crc32(buf){let c=0xffffffff;for(const v of buf)c=crcTable[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type,'ascii'),out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length,0);t.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([t,data])),8+data.length);return out;}
const scan=Buffer.alloc(H*(1+W*4));for(let y=0;y<H;y++){const off=y*(1+W*4);scan[off]=0;canvas.copy(scan,off+1,y*W*4,(y+1)*W*4);}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=6;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
fs.writeFileSync(outputPath,png);
