import * as G from './geo.js';
const W=2.20,H=2.45,S=W*H; let rng=12345; const R=()=>{rng=(rng*1103515245+12345)%2147483648;return rng/2147483648;};
const f=(x,d=4)=>x.toFixed(d);
// ---------- A : chaîne complète du mode Mur, rectangle vertical synthétique, 500 poses aléatoires
let maxE={w:0,h:0,s:0,poly:0};
for(let k=0;k<500;k++){
  const yaw=R()*2*Math.PI, fy=-2+R()*2, ox=(R()-.5)*20, oz=(R()-.5)*20;
  const dir=[Math.cos(yaw),0,Math.sin(yaw)], n=[-dir[2],0,dir[0]];
  const A=[ox,fy,oz], B=G.add(A,G.scale(dir,W));
  const s=R()*W, top=G.add(G.add(A,G.scale(dir,s)),[0,H,0]);         // point visé sur l'arête haute
  const cam=G.add(G.add(G.add(A,G.scale(dir,R()*W)),G.scale(n,0.8+R()*4)),[0,fy+0.9+R()*1.2-A[1]+A[1]-fy+ (fy) - fy,0]);
  cam[1]=fy+0.9+R()*1.2;
  const D=G.norm(G.sub(top,cam));
  const w=G.wallFrom(A,B), T=G.rayPlane(cam,D,w.A,w.n);
  const d=G.wallDiag(A,B,T);
  maxE.w=Math.max(maxE.w,Math.abs(d.largeur-W)); maxE.h=Math.max(maxE.h,Math.abs(d.hauteur-H));
  maxE.s=Math.max(maxE.s,Math.abs(d.surfaceProduit-S)); maxE.poly=Math.max(maxE.poly,Math.abs(d.surfacePolygone-S));
}
console.log(`A. Chaîne Mur, 500 positions/orientations aléatoires : écart max largeur ${maxE.w.toExponential(1)} m, hauteur ${maxE.h.toExponential(1)} m, surface produit ${maxE.s.toExponential(1)} m², surface polygone ${maxE.poly.toExponential(1)} m²  → ${maxE.s<1e-9&&maxE.poly<1e-9?'OK 5,39 m²':'ÉCHEC'}`);
// ---------- B : aire polygone 3D, orientation quelconque (y compris inclinée), ordre des sommets
function rot(v,ax,a){const k=G.norm(ax),c=Math.cos(a),s=Math.sin(a);return G.add(G.add(G.scale(v,c),G.scale(G.cross(k,v),s)),G.scale(k,G.dot(k,v)*(1-c)));}
let mb=0;
for(let k=0;k<500;k++){const ax=[R()-.5,R()-.5,R()-.5],a=R()*6.3,o=[(R()-.5)*50,(R()-.5)*50,(R()-.5)*50];
 const rect=[[0,0,0],[W,0,0],[W,H,0],[0,H,0]].map(p=>G.add(rot(p,ax,a),o)); mb=Math.max(mb,Math.abs(G.polyArea3(rect)-S),Math.abs(G.polyArea3([...rect].reverse())-S));}
console.log(`B. Aire polygone d'un rectangle 2,20×2,45 orienté au hasard (500 cas, sens direct et inverse) : écart max ${mb.toExponential(1)} m² → ${mb<1e-9?'OK':'ÉCHEC'}`);
const r0=[[0,0,0],[W,0,0],[W,H,0],[0,H,0]]; const bow=[r0[0],r0[1],r0[3],r0[2]];
console.log(`   Ordre croisé (A,B,hautA,hautB) : aire polygone = ${f(G.polyArea3(bow))} m² au lieu de 5,39 → l'aire polygone dépend de l'ordre ; le mode Mur n'utilise PAS l'aire polygone mais le produit, et construit lui-même l'ordre A, B, haut B, haut A.`);
// ---------- C : sensibilités (constats, sans correction)
const camH=1.40, dist0=2.5;
function wallTrial({delta=0,floorErr=0,aimErrDeg=0,baseInset=0,tilt=0}){
 // vrai mur plan z=0, x∈[0,W], y∈[0,H]. Caméra à dist0 devant, hauteur camH, centrée.
 const cam=[W/2,camH,dist0];
 const A=[0+baseInset,floorErr,delta], B=[W-baseInset,floorErr,delta]; // pieds (δ>0 = devant le mur)
 let top=[W/2,H,0]; if(tilt){top=[W/2,H*Math.cos(tilt),-H*Math.sin(tilt)];} // mur penché vers l'arrière
 let D=G.norm(G.sub(top,cam)); if(aimErrDeg){D=G.norm(rot(D,[1,0,0],aimErrDeg*Math.PI/180));}
 const w=G.wallFrom(A,B),T=G.rayPlane(cam,D,w.A,w.n); const d=G.wallDiag(A,B,T); return d;
}
const row=(lab,d)=>console.log(`   ${lab.padEnd(46)} largeur ${f(d.largeur,3)}  hauteur ${f(d.hauteur,3)}  surface ${f(d.surfaceProduit,3)} (${(100*(d.surfaceProduit/S-1)).toFixed(1)} %)`);
console.log('C. Sensibilité (caméra à 1,40 m de haut, 2,50 m du mur) :');
row('référence exacte',wallTrial({}));
for(const dl of [0.02,0.05,0.10]) row(`pieds visés ${dl*100} cm DEVANT le mur (plinthe, cercle)`,wallTrial({delta:dl}));
for(const dl of [-0.05]) row(`pieds visés 5 cm DERRIÈRE le mur`,wallTrial({delta:dl}));
for(const e of [0.02,-0.02]) row(`hauteur du sol détectée ${e>0?'+':''}${e*100} cm`,wallTrial({floorErr:e}));
for(const a of [0.5,1,2,3]) row(`visée du haut décalée de ${a}° (appui sur +)`,wallTrial({aimErrDeg:a}));
row('pieds visés 5 cm à l\'intérieur des angles',wallTrial({baseInset:0.05}));
row('mur non vertical (penché de 3°)',wallTrial({tilt:3*Math.PI/180}));
// ---------- D : vos 3 essais
console.log('D. Vos essais : la surface divisée par la largeur donne la hauteur réellement utilisée pour la surface');
for(const [w,h,s] of [[2.37,2.48,6.11],[2.24,2.47,5.85],[2.34,2.70,4.68]]) console.log(`   ${w} × ${h} = ${f(w*h,2)} m² ≠ ${s} m²  → hauteur implicite ${f(s/w,2)} m`);
