import { useEffect, useRef, useState, useCallback } from "react";

type Screen = "menu" | "hat_select" | "game" | "stats" | "settings" | "pause";

type Hat = {
  id: number;
  name: string;
  color: string;
  emoji: string;
  bonus: string;
  desc: string;
};

const HATS: Hat[] = [
  { id: 0, name: "Армейская", color: "#556B2F", emoji: "🪖", bonus: "none", desc: "Стандартная каска без бонусов" },
  { id: 1, name: "Синяя", color: "#1E90FF", emoji: "🔵", bonus: "speed", desc: "+50% скорость передвижения" },
  { id: 2, name: "Белая", color: "#F5F5F5", emoji: "⚪", bonus: "life", desc: "+1 дополнительная жизнь" },
  { id: 3, name: "Красная", color: "#DC143C", emoji: "🔴", bonus: "damage", desc: "+25% урон по врагам" },
  { id: 4, name: "Золотая", color: "#FFD700", emoji: "👑", bonus: "reload", desc: "Быстрая перезарядка (3 магазина)" },
];

type GameStats = {
  killed: number;
  waves: number;
  shots: number;
  time: number;
  bestWave: number;
};

const DEFAULT_STATS: GameStats = { killed: 0, waves: 0, shots: 0, time: 0, bestWave: 0 };

type Vec2 = { x: number; y: number };

type Player = {
  pos: Vec2; vel: Vec2; facing: 1 | -1; crouching: boolean;
  reloading: boolean; reloadProgress: number; ammo: number; reloads: number; maxReloads: number;
  hp: number; maxHp: number; hat: number; invincible: number;
  shootCooldown: number; muzzleFlash: number;
};

type Bullet = { pos: Vec2; vel: Vec2; life: number; fromPlayer: boolean; };
type Enemy = {
  id: number; pos: Vec2; vel: Vec2; hp: number; maxHp: number; facing: 1 | -1;
  state: "run" | "attack" | "dead"; deadTimer: number; shootTimer: number;
  animTimer: number; side: "left" | "right";
};
type Particle = { pos: Vec2; vel: Vec2; life: number; maxLife: number; color: string; size: number; };

type GameState = {
  player: Player; bullets: Bullet[]; enemies: Enemy[]; particles: Particle[];
  wave: number; waveEnemiesLeft: number; waveTimer: number; betweenWaves: boolean;
  score: number; killed: number; totalShots: number; elapsed: number;
  over: boolean; enemyIdCounter: number;
};

const GROUND_Y = 420;
const PLAYER_H = 60;
const CANVAS_W = 800;
const CANVAS_H = 500;

function createInitialState(hatId: number): GameState {
  const hat = HATS[hatId];
  const extraLife = hat.bonus === "life" ? 1 : 0;
  return {
    player: {
      pos: { x: CANVAS_W / 2, y: GROUND_Y - PLAYER_H },
      vel: { x: 0, y: 0 }, facing: 1, crouching: false,
      reloading: false, reloadProgress: 0, ammo: 30,
      reloads: hat.bonus === "reload" ? 3 : 2,
      maxReloads: hat.bonus === "reload" ? 3 : 2,
      hp: 3 + extraLife, maxHp: 3 + extraLife,
      hat: hatId, invincible: 0, shootCooldown: 0, muzzleFlash: 0,
    },
    bullets: [], enemies: [], particles: [],
    wave: 0, waveEnemiesLeft: 0, waveTimer: 0, betweenWaves: true,
    score: 0, killed: 0, totalShots: 0, elapsed: 0, over: false, enemyIdCounter: 0,
  };
}

function spawnWave(state: GameState, wave: number) {
  const count = 3 + wave * 2;
  state.waveEnemiesLeft = count;
  state.betweenWaves = false;
  state.waveTimer = 0;
  for (let i = 0; i < count; i++) {
    const side: "left" | "right" = i % 2 === 0 ? "left" : "right";
    const x = side === "left" ? -80 - Math.random() * 300 : CANVAS_W + 80 + Math.random() * 300;
    const hp = 2 + Math.floor(wave / 3);
    const spd = 1.5 + wave * 0.25 + Math.random() * 0.5;
    state.enemies.push({
      id: state.enemyIdCounter++, pos: { x, y: GROUND_Y - 55 },
      vel: { x: side === "left" ? spd : -spd, y: 0 },
      hp, maxHp: hp, facing: side === "left" ? 1 : -1,
      state: "run", deadTimer: 0,
      shootTimer: 80 + Math.random() * 60,
      animTimer: Math.random() * 60,
      side,
    });
  }
}

function drawBg(ctx: CanvasRenderingContext2D, elapsed: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  sky.addColorStop(0, "#0a0a18");
  sky.addColorStop(0.7, "#16213e");
  sky.addColorStop(1, "#0f3460");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Stars
  const stars = [[50,30],[120,60],[200,20],[310,45],[420,15],[500,55],[600,30],[680,70],[750,25],[80,90],[350,80],[650,85],[170,40],[440,65],[730,50]];
  for (const [sx,sy] of stars) {
    ctx.globalAlpha = 0.5 + Math.sin(elapsed*0.002+sx)*0.3;
    ctx.fillStyle="#fff";
    ctx.fillRect(sx,sy,2,2);
  }
  ctx.globalAlpha=1;

  // Moon
  ctx.save();
  ctx.shadowColor="#fff9c4"; ctx.shadowBlur=40;
  ctx.fillStyle="#fff9c4";
  ctx.beginPath(); ctx.arc(700,55,26,0,Math.PI*2); ctx.fill();
  ctx.restore();
  ctx.fillStyle="#0d1117";
  ctx.beginPath(); ctx.arc(712,47,21,0,Math.PI*2); ctx.fill();

  // Buildings
  const blds = [{x:0,w:90,h:165,fl:5},{x:75,w:65,h:115,fl:3},{x:128,w:105,h:205,fl:6},{x:560,w:105,h:185,fl:5},{x:652,w:80,h:135,fl:4},{x:718,w:82,h:165,fl:5}];
  for (const b of blds) {
    ctx.fillStyle="#0d1117";
    ctx.fillRect(b.x, GROUND_Y-b.h, b.w, b.h);
    const ww=10,wh=12,px=8,py=8;
    for(let r=0;r<b.fl;r++){
      const cols=Math.floor((b.w-px*2)/(ww+px));
      for(let c=0;c<cols;c++){
        const wx=b.x+px+c*(ww+px), wy=GROUND_Y-b.h+py+r*(wh+py);
        const lit=Math.sin(b.x*7+c*3+r*11)>0.2;
        ctx.fillStyle=lit?"#ffd54f":"#1a237e";
        ctx.globalAlpha=lit?0.9:0.35;
        ctx.fillRect(wx,wy,ww,wh);
      }
    }
    ctx.globalAlpha=1;
    ctx.fillStyle="#111";
    ctx.fillRect(b.x-2,GROUND_Y-b.h-5,b.w+4,7);
    ctx.strokeStyle="#333"; ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(b.x+b.w/2,GROUND_Y-b.h-5);
    ctx.lineTo(b.x+b.w/2,GROUND_Y-b.h-28);
    ctx.stroke();
  }

  // Houses
  for(const h of [{x:295,w:82,hh:78},{x:408,w:82,hh:78}]){
    ctx.fillStyle="#111827";
    ctx.fillRect(h.x,GROUND_Y-h.hh,h.w,h.hh);
    ctx.fillStyle="#1e1040";
    ctx.beginPath();
    ctx.moveTo(h.x-6,GROUND_Y-h.hh);
    ctx.lineTo(h.x+h.w/2,GROUND_Y-h.hh-38);
    ctx.lineTo(h.x+h.w+6,GROUND_Y-h.hh);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle="#0d1117";
    ctx.fillRect(h.x+h.w/2-10,GROUND_Y-30,20,30);
    ctx.fillStyle="#ffd54f"; ctx.globalAlpha=0.75;
    ctx.fillRect(h.x+10,GROUND_Y-h.hh+14,18,14);
    ctx.fillRect(h.x+h.w-28,GROUND_Y-h.hh+14,18,14);
    ctx.globalAlpha=1;
  }

  // Ground tiles
  for(let bx=0;bx<CANVAS_W;bx+=50){
    ctx.fillStyle="#5D4037";
    ctx.fillRect(bx,GROUND_Y,49,CANVAS_H-GROUND_Y);
    const gg=ctx.createLinearGradient(bx,GROUND_Y-4,bx,GROUND_Y+8);
    gg.addColorStop(0,"#2E7D32"); gg.addColorStop(1,"#1B5E20");
    ctx.fillStyle=gg;
    ctx.fillRect(bx,GROUND_Y-4,49,12);
    ctx.strokeStyle="#4CAF50"; ctx.lineWidth=1;
    ctx.strokeRect(bx+0.5,GROUND_Y-3.5,48,11);
    ctx.strokeStyle="#4E342E"; ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(bx+12,GROUND_Y+8); ctx.lineTo(bx+12,GROUND_Y+20);
    ctx.moveTo(bx+32,GROUND_Y+5); ctx.lineTo(bx+32,GROUND_Y+18);
    ctx.stroke();
  }
  ctx.fillStyle="rgba(0,0,0,0.4)";
  ctx.fillRect(0,GROUND_Y+8,CANVAS_W,4);
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: Player, elapsed: number) {
  if(p.invincible>0 && Math.floor(elapsed/80)%2===0) return;
  ctx.save();
  const bH = p.crouching ? PLAYER_H*0.6 : PLAYER_H;
  const baseY = p.pos.y + bH;
  const bob = p.crouching ? 0 : Math.sin(elapsed*0.015)*2;
  ctx.translate(p.pos.x, baseY+bob);
  ctx.scale(p.facing, 1);

  // Shadow
  ctx.save(); ctx.scale(1,0.2);
  ctx.fillStyle="rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(0,0,22,12,0,0,Math.PI*2); ctx.fill();
  ctx.restore();

  const wc=Math.sin(elapsed*0.025);

  if(!p.crouching){
    for(const [tx,sign] of [[-6,-1],[6,1]]){
      ctx.save(); ctx.translate(tx,-20); ctx.rotate(wc*0.35*sign);
      ctx.fillStyle=sign===-1?"#3E4B3E":"#4A5A4A";
      ctx.fillRect(-5,0,11,26);
      ctx.fillStyle="#1a1a1a"; ctx.fillRect(-6,22,13,8);
      ctx.restore();
    }
  } else {
    ctx.fillStyle="#3E4B3E";
    ctx.fillRect(-14,-12,12,14); ctx.fillRect(2,-12,12,14);
    ctx.fillStyle="#1a1a1a";
    ctx.fillRect(-16,-2,14,7); ctx.fillRect(0,-2,14,7);
  }

  const ty = p.crouching ? -bH+14 : -bH+20;
  ctx.fillStyle="#4A5E4A";
  ctx.fillRect(-14,ty,28,bH-30);
  ctx.fillStyle="#2d3a2d";
  ctx.fillRect(-10,ty+4,8,6); ctx.fillRect(2,ty+10,7,5); ctx.fillRect(-12,ty+14,6,5);
  ctx.fillStyle="#2b1d0e"; ctx.fillRect(-14,ty+bH-36,28,6);
  ctx.fillStyle="#888"; ctx.fillRect(-4,ty+bH-36,8,6);

  const as=p.crouching?0:wc*0.2;
  for(const [tx,sign] of [[-12,-1],[12,1]]){
    ctx.save(); ctx.translate(tx,ty+8); ctx.rotate(-as*sign);
    ctx.fillStyle="#4A5E4A"; ctx.fillRect(-4,0,9,18);
    ctx.fillStyle="#c68642"; ctx.fillRect(-4,16,9,8);
    ctx.restore();
  }

  const hy=ty-26;
  ctx.fillStyle="#c68642"; ctx.fillRect(-5,ty-4,10,6);
  ctx.beginPath(); ctx.roundRect(-13,hy,26,24,4); ctx.fill();
  ctx.fillStyle="rgba(0,0,0,0.12)"; ctx.fillRect(-2,hy+6,14,12);
  ctx.fillStyle="#fff"; ctx.fillRect(2,hy+7,7,5);
  ctx.fillStyle="#1a1a1a"; ctx.fillRect(5,hy+8,3,3);
  ctx.fillStyle="rgba(255,255,255,0.8)"; ctx.fillRect(6,hy+8,1,1);

  // Hat
  if(p.hat===0){
    ctx.fillStyle="#556B2F";
    ctx.beginPath(); ctx.ellipse(0,hy+2,16,12,0,Math.PI,0); ctx.fill();
    ctx.fillRect(-16,hy+1,32,6);
    ctx.fillStyle="#4a5e30"; ctx.fillRect(-16,hy+2,32,3);
  } else if(p.hat===1){
    ctx.fillStyle="#1E90FF";
    ctx.beginPath(); ctx.ellipse(0,hy,15,9,0,Math.PI,0); ctx.fill();
    ctx.fillRect(-15,hy-1,30,5);
    ctx.fillStyle="#1565C0"; ctx.fillRect(-15,hy,22,4);
    ctx.fillStyle="#fff"; ctx.fillRect(-3,hy-6,6,4);
  } else if(p.hat===2){
    ctx.fillStyle="#F5F5F5";
    ctx.beginPath(); ctx.ellipse(0,hy,14,8,0,Math.PI,0); ctx.fill();
    ctx.fillRect(-14,hy-1,28,4);
    ctx.fillStyle="#E0E0E0"; ctx.fillRect(-22,hy,44,4);
    ctx.fillStyle="#bdbdbd"; ctx.fillRect(-14,hy,28,3);
  } else if(p.hat===3){
    ctx.fillStyle="#DC143C";
    ctx.beginPath(); ctx.ellipse(2,hy-2,16,10,-0.2,Math.PI,0); ctx.fill();
    ctx.fillRect(-14,hy+1,28,3);
    ctx.fillStyle="#ffd700";
    ctx.beginPath(); ctx.arc(-5,hy-1,4,0,Math.PI*2); ctx.fill();
  } else {
    ctx.fillStyle="#FFD700"; ctx.fillRect(-14,hy,28,10);
    ctx.beginPath();
    ctx.moveTo(-14,hy); ctx.lineTo(-10,hy-12); ctx.lineTo(-4,hy-4);
    ctx.lineTo(0,hy-14); ctx.lineTo(4,hy-4); ctx.lineTo(10,hy-12); ctx.lineTo(14,hy);
    ctx.closePath(); ctx.fill();
    for(const [cx2,cy2,col] of [[-10,hy-9,"#DC143C"],[0,hy-11,"#1E90FF"],[10,hy-9,"#32CD32"]]){
      ctx.fillStyle=col as string;
      ctx.beginPath(); ctx.arc(cx2 as number,cy2 as number,3,0,Math.PI*2); ctx.fill();
    }
    ctx.strokeStyle="#FFA000"; ctx.lineWidth=1;
    ctx.strokeRect(-14,hy,28,10);
  }

  // AK-47
  ctx.save();
  ctx.translate(14, ty+10);
  ctx.rotate(p.crouching?0.15:0.1);
  ctx.fillStyle="#5C3A1E"; ctx.fillRect(-2,4,6,16);
  ctx.fillStyle="#2a2a2a"; ctx.fillRect(-2,-2,22,9);
  ctx.fillStyle="#1a1a1a"; ctx.fillRect(18,1,20,5);
  ctx.fillStyle="#333";
  ctx.save(); ctx.translate(8,7); ctx.rotate(0.1);
  ctx.fillRect(-3,0,7,14); ctx.restore();
  ctx.fillStyle="#3a3a3a"; ctx.fillRect(2,-6,16,4);
  ctx.fillStyle="#444"; ctx.fillRect(34,-4,3,5);
  if(p.muzzleFlash>0){
    const a=p.muzzleFlash/6;
    ctx.save();
    ctx.shadowColor="#ffaa00"; ctx.shadowBlur=20*a;
    ctx.fillStyle=`rgba(255,200,50,${a})`;
    ctx.beginPath(); ctx.ellipse(44,3,14*a,8*a,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=`rgba(255,255,200,${a*0.8})`;
    ctx.beginPath(); ctx.ellipse(44,3,6*a,4*a,0,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, elapsed: number) {
  ctx.save();
  ctx.translate(e.pos.x, e.pos.y+55);
  ctx.scale(e.facing,1);
  if(e.state==="dead"){
    ctx.globalAlpha=Math.max(0,e.deadTimer/60);
    ctx.rotate(1.4);
  }
  const wc=Math.sin(elapsed*0.02+e.id);
  ctx.save(); ctx.scale(1,0.2);
  ctx.fillStyle="rgba(0,0,0,0.3)";
  ctx.beginPath(); ctx.ellipse(0,0,18,8,0,0,Math.PI*2); ctx.fill();
  ctx.restore();
  if(e.state!=="dead"){
    for(const [tx,sign] of [[-5,-1],[5,1]]){
      ctx.save(); ctx.translate(tx,-18); ctx.rotate(wc*0.4*sign);
      ctx.fillStyle=sign===-1?"#1a1a1a":"#222";
      ctx.fillRect(-4,0,9,22);
      ctx.fillStyle="#0d0d0d"; ctx.fillRect(-5,19,11,7);
      ctx.restore();
    }
  } else {
    ctx.fillStyle="#1a1a1a";
    ctx.fillRect(-14,-12,12,14); ctx.fillRect(2,-12,12,14);
  }
  ctx.fillStyle="#1a1a1a"; ctx.fillRect(-13,-50,26,32);
  ctx.strokeStyle="#333"; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(-13,-40); ctx.lineTo(13,-40);
  ctx.moveTo(-13,-30); ctx.lineTo(13,-30); ctx.stroke();
  ctx.fillStyle="#c0773a";
  ctx.beginPath(); ctx.roundRect(-11,-70,22,22,4); ctx.fill();
  ctx.fillStyle="#8B0000"; ctx.fillRect(-11,-60,22,10);
  ctx.fillStyle="#ff3300";
  ctx.fillRect(-7,-66,5,4); ctx.fillRect(2,-66,5,4);
  ctx.fillStyle="#111";
  ctx.beginPath(); ctx.ellipse(0,-70,12,7,0,Math.PI,0); ctx.fill();
  ctx.fillRect(-12,-72,24,5);
  ctx.save(); ctx.translate(12,-44); ctx.rotate(e.state==="attack"?-0.5:0.2);
  ctx.fillStyle="#888"; ctx.fillRect(0,-2,18,4);
  ctx.fillStyle="#555"; ctx.fillRect(-4,-3,6,8);
  ctx.restore();
  if(e.state!=="dead"){
    ctx.fillStyle="rgba(0,0,0,0.6)";
    ctx.fillRect(-18,-84,36,6);
    const pct=e.hp/e.maxHp;
    ctx.fillStyle=pct>0.6?"#4CAF50":pct>0.3?"#FF9800":"#f44336";
    ctx.fillRect(-18,-84,36*pct,6);
  }
  ctx.restore();
}

function drawHUD(ctx: CanvasRenderingContext2D, state: GameState) {
  const p=state.player;
  ctx.fillStyle="rgba(0,0,0,0.65)";
  ctx.beginPath(); ctx.roundRect(14,12,170,24,6); ctx.fill();
  for(let i=0;i<p.maxHp;i++){
    ctx.fillStyle=i<p.hp?"#f44336":"#333";
    ctx.beginPath(); ctx.roundRect(18+i*36,16,30,16,4); ctx.fill();
    if(i<p.hp){ ctx.fillStyle="#ff6b6b"; ctx.fillRect(20+i*36,18,8,5); }
  }
  ctx.fillStyle="rgba(255,255,255,0.6)"; ctx.font="bold 10px Oswald,sans-serif";
  ctx.fillText("❤ HP",22,46);

  ctx.fillStyle="rgba(0,0,0,0.65)";
  ctx.beginPath(); ctx.roundRect(14,50,170,22,6); ctx.fill();
  for(let i=0;i<30;i++){
    ctx.fillStyle=i<p.ammo?"#FFD54F":"#333";
    ctx.fillRect(18+Math.floor(i/3)*18, 54+(i%3)*6, 14, 4);
  }
  ctx.fillStyle="#FFD54F"; ctx.font="bold 10px Oswald,sans-serif";
  ctx.fillText(`🔫 ${p.ammo}/30`,18,85);

  ctx.fillStyle="rgba(0,0,0,0.65)";
  ctx.beginPath(); ctx.roundRect(14,92,145,20,6); ctx.fill();
  ctx.fillStyle="#fff"; ctx.font="bold 10px Oswald,sans-serif";
  ctx.fillText("Магазины:",20,106);
  for(let i=0;i<p.maxReloads;i++){
    ctx.fillStyle=i<p.reloads?"#4CAF50":"#333";
    ctx.beginPath(); ctx.roundRect(106+i*16,95,12,14,2); ctx.fill();
  }

  if(p.reloading){
    ctx.fillStyle="rgba(0,0,0,0.75)";
    ctx.beginPath(); ctx.roundRect(CANVAS_W/2-85,CANVAS_H/2+30,170,30,8); ctx.fill();
    ctx.fillStyle="#4CAF50";
    ctx.beginPath(); ctx.roundRect(CANVAS_W/2-81,CANVAS_H/2+34,162*p.reloadProgress,22,6); ctx.fill();
    ctx.fillStyle="#fff"; ctx.font="bold 13px Oswald,sans-serif"; ctx.textAlign="center";
    ctx.fillText("ПЕРЕЗАРЯДКА...",CANVAS_W/2,CANVAS_H/2+51); ctx.textAlign="left";
  }

  ctx.fillStyle="rgba(0,0,0,0.65)";
  ctx.beginPath(); ctx.roundRect(CANVAS_W-175,12,162,64,8); ctx.fill();
  ctx.fillStyle="#FFD54F"; ctx.font="bold 22px Oswald,sans-serif"; ctx.textAlign="right";
  ctx.fillText(`${state.score}`,CANVAS_W-18,38);
  ctx.fillStyle="#888"; ctx.font="11px Oswald,sans-serif";
  ctx.fillText("очков",CANVAS_W-18,52);
  ctx.fillStyle="#fff"; ctx.font="bold 15px Oswald,sans-serif";
  ctx.fillText(`Волна ${state.wave}`,CANVAS_W-18,70);
  ctx.textAlign="left";

  if(state.betweenWaves&&!state.over){
    const nw=state.wave+1;
    ctx.fillStyle="rgba(0,0,0,0.55)";
    ctx.beginPath(); ctx.roundRect(CANVAS_W/2-135,CANVAS_H/2-28,270,54,14); ctx.fill();
    ctx.fillStyle="#FFD54F"; ctx.font="bold 22px Oswald,sans-serif"; ctx.textAlign="center";
    ctx.fillText(`Волна ${nw} начнётся через...`,CANVAS_W/2,CANVAS_H/2+4);
    const t=Math.ceil((180-state.waveTimer)/60);
    ctx.fillStyle="#fff"; ctx.font="16px Oswald,sans-serif";
    ctx.fillText(`${t} сек`,CANVAS_W/2,CANVAS_H/2+24);
    ctx.textAlign="left";
  }

  if(p.ammo===0&&!p.reloading&&p.reloads>0){
    ctx.fillStyle="rgba(200,30,30,0.9)";
    ctx.beginPath(); ctx.roundRect(CANVAS_W/2-115,CANVAS_H/2-72,230,32,8); ctx.fill();
    ctx.fillStyle="#fff"; ctx.font="bold 15px Oswald,sans-serif"; ctx.textAlign="center";
    ctx.fillText("Нажми R — ПЕРЕЗАРЯДКА!",CANVAS_W/2,CANVAS_H/2-50); ctx.textAlign="left";
  } else if(p.ammo===0&&!p.reloading&&p.reloads===0){
    ctx.fillStyle="rgba(150,0,0,0.9)";
    ctx.beginPath(); ctx.roundRect(CANVAS_W/2-110,CANVAS_H/2-72,220,32,8); ctx.fill();
    ctx.fillStyle="#fff"; ctx.font="bold 14px Oswald,sans-serif"; ctx.textAlign="center";
    ctx.fillText("ПАТРОНЫ КОНЧИЛИСЬ!",CANVAS_W/2,CANVAS_H/2-50); ctx.textAlign="left";
  }

  ctx.fillStyle="rgba(255,255,255,0.25)"; ctx.font="10px Oswald,sans-serif";
  ctx.fillText("WASD движение  ЛКМ стрелять  R перезарядка  ESC пауза",16,CANVAS_H-8);
}

export default function Index() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [selectedHat, setSelectedHat] = useState(0);
  const [stats, setStats] = useState<GameStats>(DEFAULT_STATS);
  const [volume, setVolume] = useState(70);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const mouseRef = useRef({ x: 0, y: 0, down: false });
  const rafRef = useRef<number>(0);
  const lastTRef = useRef<number>(0);
  const elRef = useRef<number>(0);
  const screenRef = useRef<Screen>("menu");
  screenRef.current = screen;

  const addParticles = useCallback((state: GameState, x: number, y: number, color: string, n: number) => {
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2, s=2+Math.random()*4;
      state.particles.push({pos:{x,y},vel:{x:Math.cos(a)*s,y:Math.sin(a)*s-2},life:20+Math.random()*30,maxLife:50,color,size:2+Math.random()*3});
    }
  },[]);

  const tick = useCallback((ts: number) => {
    if(screenRef.current!=="game") return;
    const dt=Math.min(ts-lastTRef.current,50);
    lastTRef.current=ts;
    elRef.current+=dt;
    const state=stateRef.current;
    if(!state||state.over) return;
    const canvas=canvasRef.current;
    if(!canvas) return;
    const ctx=canvas.getContext("2d");
    if(!ctx) return;
    const keys=keysRef.current;
    const mouse=mouseRef.current;
    const p=state.player;
    const hat=HATS[p.hat];
    const spd=hat.bonus==="speed"?4.5:3;
    const el=elRef.current;
    state.elapsed+=dt/1000;

    p.vel.x=0;
    if(keys.has("a")||keys.has("arrowleft")){p.vel.x=-spd;p.facing=-1;}
    if(keys.has("d")||keys.has("arrowright")){p.vel.x=spd;p.facing=1;}
    p.crouching=keys.has("s")||keys.has("arrowdown");

    const rect=canvas.getBoundingClientRect();
    const mx=(mouse.x-rect.left)*(CANVAS_W/rect.width);
    if(mx>p.pos.x+10) p.facing=1;
    else if(mx<p.pos.x-10) p.facing=-1;

    p.pos.x=Math.max(20,Math.min(CANVAS_W-20,p.pos.x+p.vel.x));
    p.pos.y=GROUND_Y-(p.crouching?PLAYER_H*0.6:PLAYER_H);

    if(p.muzzleFlash>0) p.muzzleFlash--;
    if(p.shootCooldown>0) p.shootCooldown--;
    if(p.invincible>0) p.invincible--;

    if(mouse.down&&!p.reloading&&p.ammo>0&&p.shootCooldown<=0){
      p.ammo--;
      p.shootCooldown=hat.bonus==="damage"?6:8;
      p.muzzleFlash=6;
      state.totalShots++;
      const gx=p.pos.x+p.facing*50;
      const gy=p.pos.y+(p.crouching?PLAYER_H*0.3:PLAYER_H*0.4);
      const ang=p.facing===1?0:Math.PI;
      const sp=(Math.random()-0.5)*0.12;
      state.bullets.push({pos:{x:gx,y:gy},vel:{x:Math.cos(ang+sp)*14,y:Math.sin(ang+sp)*14},life:40,fromPlayer:true});
      addParticles(state,gx,gy,"#FFD54F",4);
    }

    if(p.reloading){
      p.reloadProgress+=hat.bonus==="reload"?0.025:0.015;
      if(p.reloadProgress>=1){p.ammo=30;p.reloading=false;p.reloadProgress=0;}
    }

    for(let i=state.bullets.length-1;i>=0;i--){
      const b=state.bullets[i];
      b.pos.x+=b.vel.x; b.pos.y+=b.vel.y; b.life--;
      if(b.life<=0||b.pos.x<-20||b.pos.x>CANVAS_W+20){state.bullets.splice(i,1);continue;}
      if(b.fromPlayer){
        for(let j=state.enemies.length-1;j>=0;j--){
          const e=state.enemies[j];
          if(e.state==="dead") continue;
          const dx=b.pos.x-e.pos.x, dy=b.pos.y-(e.pos.y+25);
          if(Math.abs(dx)<22&&Math.abs(dy)<30){
            e.hp-=hat.bonus==="damage"?2:1;
            addParticles(state,e.pos.x,e.pos.y+20,"#cc0000",6);
            state.bullets.splice(i,1);
            if(e.hp<=0){
              e.state="dead"; e.deadTimer=60; state.killed++; state.score+=100+state.wave*10;
              addParticles(state,e.pos.x,e.pos.y,"#ff4400",12);
            }
            break;
          }
        }
      } else {
        const dx=b.pos.x-p.pos.x, dy=b.pos.y-(p.pos.y+PLAYER_H/2);
        if(Math.abs(dx)<18&&Math.abs(dy)<35&&p.invincible<=0){
          p.hp--; p.invincible=90;
          state.bullets.splice(i,1);
          addParticles(state,p.pos.x,p.pos.y+20,"#ff0000",8);
          if(p.hp<=0){
            state.over=true;
            setStats(prev=>({killed:prev.killed+state.killed,waves:prev.waves+state.wave,shots:prev.shots+state.totalShots,time:prev.time+Math.round(state.elapsed),bestWave:Math.max(prev.bestWave,state.wave)}));
            setTimeout(()=>setScreen("stats"),1200);
          }
        }
      }
    }

    for(let i=state.enemies.length-1;i>=0;i--){
      const e=state.enemies[i];
      if(e.state==="dead"){
        e.deadTimer--;
        if(e.deadTimer<=0){state.enemies.splice(i,1);state.waveEnemiesLeft--;}
        continue;
      }
      e.animTimer++;
      const dx=p.pos.x-e.pos.x;
      if(Math.abs(dx)>60){
        e.vel.x=dx>0?Math.abs(e.vel.x):-Math.abs(e.vel.x);
        e.facing=dx>0?1:-1;
        e.pos.x+=e.vel.x;
        e.state="run";
      } else {
        e.state="attack";
        e.shootTimer--;
        if(e.shootTimer<=0){
          e.shootTimer=Math.max(40,80-state.wave*4);
          if(p.invincible<=0){
            p.hp--; p.invincible=90;
            addParticles(state,p.pos.x,p.pos.y+20,"#ff0000",8);
            if(p.hp<=0){
              state.over=true;
              setStats(prev=>({killed:prev.killed+state.killed,waves:prev.waves+state.wave,shots:prev.shots+state.totalShots,time:prev.time+Math.round(state.elapsed),bestWave:Math.max(prev.bestWave,state.wave)}));
              setTimeout(()=>setScreen("stats"),1200);
            }
          }
        }
      }
      if(Math.abs(dx)>80&&state.wave>=2){
        e.shootTimer--;
        if(e.shootTimer<=0){
          e.shootTimer=Math.max(60,120-state.wave*5);
          const ba=dx>0?0:Math.PI;
          state.bullets.push({pos:{x:e.pos.x,y:e.pos.y+20},vel:{x:Math.cos(ba)*6,y:0},life:80,fromPlayer:false});
        }
      }
      e.pos.y=GROUND_Y-55;
    }

    for(let i=state.particles.length-1;i>=0;i--){
      const pt=state.particles[i];
      pt.pos.x+=pt.vel.x; pt.pos.y+=pt.vel.y; pt.vel.y+=0.2; pt.life--;
      if(pt.life<=0) state.particles.splice(i,1);
    }

    if(state.betweenWaves){
      state.waveTimer++;
      if(state.waveTimer>=180){state.wave++;spawnWave(state,state.wave);}
    } else {
      const alive=state.enemies.filter(e=>e.state!=="dead").length;
      const dying=state.enemies.filter(e=>e.state==="dead").length;
      if(alive===0&&dying===0&&state.waveEnemiesLeft===0){state.betweenWaves=true;state.waveTimer=0;}
    }

    ctx.clearRect(0,0,CANVAS_W,CANVAS_H);
    drawBg(ctx,el);
    for(const pt of state.particles){
      ctx.globalAlpha=pt.life/pt.maxLife;
      ctx.fillStyle=pt.color;
      ctx.beginPath(); ctx.arc(pt.pos.x,pt.pos.y,pt.size*(pt.life/pt.maxLife),0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha=1;
    for(const b of state.bullets){
      ctx.save();
      ctx.fillStyle=b.fromPlayer?"#FFD54F":"#ff4444";
      ctx.shadowColor=b.fromPlayer?"#FFD54F":"#ff0000"; ctx.shadowBlur=8;
      ctx.beginPath(); ctx.arc(b.pos.x,b.pos.y,b.fromPlayer?3:4,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
    drawPlayer(ctx,p,el);
    for(const e of state.enemies) drawEnemy(ctx,e,el);
    drawHUD(ctx,state);

    if(state.over){
      ctx.fillStyle="rgba(0,0,0,0.72)";
      ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      ctx.fillStyle="#f44336"; ctx.font="bold 56px Oswald,sans-serif"; ctx.textAlign="center";
      ctx.fillText("УБИТ",CANVAS_W/2,CANVAS_H/2-20);
      ctx.fillStyle="#fff"; ctx.font="24px Oswald,sans-serif";
      ctx.fillText(`Волна: ${state.wave}   Убито: ${state.killed}`,CANVAS_W/2,CANVAS_H/2+20);
      ctx.textAlign="left";
    }

    rafRef.current=requestAnimationFrame(tick);
  },[addParticles]);

  const startGame=useCallback(()=>{
    stateRef.current=createInitialState(selectedHat);
    elRef.current=0; lastTRef.current=performance.now();
    setScreen("game");
    setTimeout(()=>{rafRef.current=requestAnimationFrame(tick);},50);
  },[selectedHat,tick]);

  useEffect(()=>{
    if(screen!=="game") return;
    const dn=(e:KeyboardEvent)=>{
      const k=e.key.toLowerCase(); keysRef.current.add(k);
      if(k==="r"){
        const state=stateRef.current; if(!state) return;
        const p=state.player;
        if(p.ammo<30&&p.reloads>0&&!p.reloading){p.reloading=true;p.reloadProgress=0;p.reloads--;}
      }
      if(k==="escape"||k==="p"){setScreen("pause");cancelAnimationFrame(rafRef.current);}
    };
    const up=(e:KeyboardEvent)=>keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown",dn); window.addEventListener("keyup",up);
    return()=>{window.removeEventListener("keydown",dn);window.removeEventListener("keyup",up);};
  },[screen]);

  useEffect(()=>{
    if(screen!=="game") return;
    const canvas=canvasRef.current; if(!canvas) return;
    const mm=(e:MouseEvent)=>{mouseRef.current.x=e.clientX;mouseRef.current.y=e.clientY;};
    const md=(e:MouseEvent)=>{if(e.button===0)mouseRef.current.down=true;};
    const mu=(e:MouseEvent)=>{if(e.button===0)mouseRef.current.down=false;};
    canvas.addEventListener("mousemove",mm); canvas.addEventListener("mousedown",md); canvas.addEventListener("mouseup",mu);
    window.addEventListener("mousemove",mm);
    return()=>{canvas.removeEventListener("mousemove",mm);canvas.removeEventListener("mousedown",md);canvas.removeEventListener("mouseup",mu);window.removeEventListener("mousemove",mm);};
  },[screen]);

  const resume=useCallback(()=>{
    setScreen("game"); lastTRef.current=performance.now();
    rafRef.current=requestAnimationFrame(tick);
  },[tick]);

  // ========== SCREENS ==========

  const bgStyle: React.CSSProperties = {
    fontFamily:"'Oswald',sans-serif",
    background:"linear-gradient(160deg,#0a0a18 0%,#1a1a2e 55%,#0f3460 100%)",
    minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
    position:"relative", overflow:"hidden", userSelect:"none",
  };

  const btnPrimary: React.CSSProperties = {
    background:"linear-gradient(135deg,#b71c1c,#e53935)", color:"#fff",
    border:"2px solid #ef5350", borderRadius:10, padding:"14px 0",
    fontFamily:"'Oswald',sans-serif", fontWeight:700, fontSize:18,
    letterSpacing:3, textTransform:"uppercase" as const, cursor:"pointer",
    boxShadow:"0 4px 24px rgba(180,28,28,0.45)", transition:"transform 0.15s",
  };

  if(screen==="menu") return (
    <div style={bgStyle}>
      <div style={{position:"absolute",top:24,right:60,width:52,height:52,borderRadius:"50%",background:"#fff9c4",boxShadow:"0 0 50px 18px rgba(255,249,196,0.25)"}}/>
      <div style={{position:"absolute",top:18,right:52,width:46,height:46,borderRadius:"50%",background:"#0a0a18"}}/>
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:180,pointerEvents:"none"}}>
        {[{l:0,w:90,h:160},{l:75,w:65,h:115},{l:128,w:105,h:205},{l:600,w:105,h:185},{l:700,w:80,h:135},{l:720,w:82,h:165}].map((b,i)=>(
          <div key={i} style={{position:"absolute",bottom:0,left:b.l,width:b.w,height:b.h,background:"#0d1117"}}/>
        ))}
      </div>
      <div style={{position:"relative",zIndex:10,display:"flex",flexDirection:"column",alignItems:"center",gap:20,padding:"0 24px"}}>
        <div style={{textAlign:"center",marginBottom:8}}>
          <div style={{fontSize:72,fontWeight:900,letterSpacing:8,color:"#FFD54F",textShadow:"0 0 50px rgba(255,213,79,0.5),0 4px 0 #222",lineHeight:1}}>ВЫЖИТЬ</div>
          <div style={{color:"#555",fontSize:14,letterSpacing:6,marginTop:8}}>2D · SURVIVAL · SHOOTER</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10,width:256}}>
          <button style={btnPrimary} onClick={startGame}>🎮 ИГРАТЬ</button>
          <button style={{...btnPrimary,background:"linear-gradient(135deg,#0d47a1,#1976D2)",border:"2px solid #42A5F5",boxShadow:"0 4px 24px rgba(13,71,161,0.45)"}} onClick={()=>setScreen("hat_select")}>🎩 ШЛЯПЫ</button>
          <button style={{...btnPrimary,background:"rgba(255,255,255,0.06)",color:"#888",border:"2px solid #2a2a2a",boxShadow:"none"}} onClick={()=>setScreen("stats")}>📊 СТАТИСТИКА</button>
          <button style={{...btnPrimary,background:"rgba(255,255,255,0.06)",color:"#888",border:"2px solid #2a2a2a",boxShadow:"none"}} onClick={()=>setScreen("settings")}>⚙️ НАСТРОЙКИ</button>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:14,padding:"12px 18px",borderRadius:12,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)"}}>
          <span style={{fontSize:28}}>{HATS[selectedHat].emoji}</span>
          <div>
            <div style={{color:"#fff",fontWeight:700,fontSize:13}}>{HATS[selectedHat].name} шляпа</div>
            <div style={{color:"#555",fontSize:12}}>{HATS[selectedHat].desc}</div>
          </div>
        </div>
      </div>
    </div>
  );

  if(screen==="hat_select") return (
    <div style={bgStyle}>
      <button onClick={()=>setScreen("menu")} style={{position:"absolute",top:20,left:20,color:"#555",background:"none",border:"none",fontFamily:"'Oswald',sans-serif",fontSize:13,letterSpacing:2,cursor:"pointer"}}>← НАЗАД</button>
      <div style={{color:"#FFD54F",fontSize:40,fontWeight:900,letterSpacing:6,marginBottom:6,textShadow:"0 0 20px rgba(255,213,79,0.3)"}}>ВЫБОР ШЛЯПЫ</div>
      <div style={{color:"#444",fontSize:12,letterSpacing:4,marginBottom:24}}>ШЛЯПА ДАЁТ БОНУС ПЕРСОНАЖУ</div>
      <div style={{display:"flex",flexDirection:"column",gap:10,width:"100%",maxWidth:340,padding:"0 16px"}}>
        {HATS.map(h=>(
          <button key={h.id} onClick={()=>setSelectedHat(h.id)} style={{
            display:"flex",alignItems:"center",gap:14,padding:"14px 18px",borderRadius:12,cursor:"pointer",
            background:selectedHat===h.id?`linear-gradient(135deg,${h.color}18,${h.color}35)`:"rgba(255,255,255,0.04)",
            border:`2px solid ${selectedHat===h.id?h.color:"rgba(255,255,255,0.08)"}`,
            boxShadow:selectedHat===h.id?`0 0 22px ${h.color}44`:"none",
            transition:"all 0.15s", fontFamily:"'Oswald',sans-serif",
          }}>
            <span style={{fontSize:32}}>{h.emoji}</span>
            <div style={{flex:1,textAlign:"left"}}>
              <div style={{color:"#fff",fontWeight:700,fontSize:15}}>{h.name} шляпа</div>
              <div style={{color:"#666",fontSize:12}}>{h.desc}</div>
            </div>
            {selectedHat===h.id&&<span style={{color:"#4CAF50",fontWeight:700,fontSize:18}}>✓</span>}
          </button>
        ))}
      </div>
      <button style={{...btnPrimary,marginTop:24,padding:"12px 40px",fontSize:16}} onClick={()=>setScreen("menu")}>ГОТОВО</button>
    </div>
  );

  if(screen==="game"||screen==="pause") return (
    <div style={{...bgStyle,background:"#0a0a18"}}>
      <div style={{position:"relative",width:"min(100vw,800px)",aspectRatio:"800/500"}}>
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
          style={{width:"100%",height:"100%",display:"block",cursor:"crosshair"}}/>
        {screen==="pause"&&(
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.78)",fontFamily:"'Oswald',sans-serif"}}>
            <div style={{color:"#FFD54F",fontSize:52,fontWeight:900,letterSpacing:8,marginBottom:28,textShadow:"0 0 30px rgba(255,213,79,0.5)"}}>ПАУЗА</div>
            <div style={{display:"flex",flexDirection:"column",gap:10,width:220}}>
              <button style={btnPrimary} onClick={resume}>▶ ПРОДОЛЖИТЬ</button>
              <button style={{...btnPrimary,background:"rgba(255,255,255,0.07)",color:"#ccc",border:"2px solid #333",boxShadow:"none"}} onClick={()=>{setScreen("hat_select");cancelAnimationFrame(rafRef.current);}}>🎩 СМЕНИТЬ ШЛЯПУ</button>
              <button style={{...btnPrimary,background:"rgba(255,255,255,0.07)",color:"#ccc",border:"2px solid #333",boxShadow:"none"}} onClick={()=>{setScreen("menu");cancelAnimationFrame(rafRef.current);}}>🏠 ГЛАВНОЕ МЕНЮ</button>
            </div>
          </div>
        )}
      </div>
      {/* Mobile controls */}
      <div style={{display:"flex",gap:16,marginTop:12}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,56px)",gridTemplateRows:"56px 56px",gap:4}}>
          {(["","w","","a","s","d"] as string[]).map((k,i)=>k?(
            <button key={i} style={{width:56,height:56,borderRadius:10,background:"rgba(255,255,255,0.12)",border:"2px solid rgba(255,255,255,0.18)",color:"#fff",fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:18,cursor:"pointer"}}
              onTouchStart={()=>keysRef.current.add(k)} onTouchEnd={()=>keysRef.current.delete(k)}>
              {k.toUpperCase()}
            </button>
          ):<div key={i} style={{width:56,height:56}}/>)}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4,marginLeft:8}}>
          <button style={{width:90,height:56,borderRadius:10,background:"rgba(180,28,28,0.7)",border:"2px solid #ef5350",color:"#fff",fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}
            onTouchStart={()=>{mouseRef.current.down=true;}} onTouchEnd={()=>{mouseRef.current.down=false;}}>🔫 ОГОНЬ</button>
          <button style={{width:90,height:56,borderRadius:10,background:"rgba(0,100,0,0.7)",border:"2px solid #4CAF50",color:"#fff",fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}
            onTouchStart={()=>{const state=stateRef.current;if(!state)return;const p=state.player;if(p.ammo<30&&p.reloads>0&&!p.reloading){p.reloading=true;p.reloadProgress=0;p.reloads--;}}}>🔄 RELOAD</button>
        </div>
      </div>
      <div style={{color:"#333",fontSize:11,marginTop:6,fontFamily:"'Oswald',sans-serif",letterSpacing:2}}>ESC / P — ПАУЗА</div>
    </div>
  );

  if(screen==="stats") return (
    <div style={bgStyle}>
      <div style={{color:"#FFD54F",fontSize:48,fontWeight:900,letterSpacing:6,marginBottom:32,textShadow:"0 0 20px rgba(255,213,79,0.3)"}}>СТАТИСТИКА</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,width:"100%",maxWidth:340,padding:"0 16px",marginBottom:28}}>
        {[
          {icon:"💀",v:stats.killed,l:"Убито врагов"},
          {icon:"🌊",v:stats.bestWave,l:"Лучшая волна"},
          {icon:"🔫",v:stats.shots,l:"Выстрелов"},
          {icon:"⏱",v:`${stats.time}с`,l:"Время в игре"},
        ].map((s,i)=>(
          <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"18px 12px",borderRadius:14,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)"}}>
            <div style={{fontSize:30,marginBottom:6}}>{s.icon}</div>
            <div style={{color:"#fff",fontSize:28,fontWeight:900}}>{s.v}</div>
            <div style={{color:"#444",fontSize:11,letterSpacing:1,marginTop:4}}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:10}}>
        <button style={btnPrimary} onClick={startGame}>ИГРАТЬ ЕЩЁ</button>
        <button style={{...btnPrimary,background:"rgba(255,255,255,0.06)",color:"#888",border:"2px solid #2a2a2a",boxShadow:"none",padding:"14px 24px"}} onClick={()=>setScreen("menu")}>МЕНЮ</button>
      </div>
    </div>
  );

  if(screen==="settings") return (
    <div style={bgStyle}>
      <button onClick={()=>setScreen("menu")} style={{position:"absolute",top:20,left:20,color:"#555",background:"none",border:"none",fontFamily:"'Oswald',sans-serif",fontSize:13,letterSpacing:2,cursor:"pointer"}}>← НАЗАД</button>
      <div style={{color:"#fff",fontSize:44,fontWeight:900,letterSpacing:6,marginBottom:32}}>НАСТРОЙКИ</div>
      <div style={{display:"flex",flexDirection:"column",gap:14,width:"100%",maxWidth:340,padding:"0 16px"}}>
        <div style={{borderRadius:12,padding:"16px 18px",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)"}}>
          <div style={{color:"#fff",fontWeight:700,fontSize:12,letterSpacing:3,marginBottom:10}}>ГРОМКОСТЬ</div>
          <input type="range" min={0} max={100} value={volume} onChange={e=>setVolume(+e.target.value)} style={{width:"100%",accentColor:"#e53935"}}/>
          <div style={{color:"#555",fontSize:12,marginTop:4}}>{volume}%</div>
        </div>
        <div style={{borderRadius:12,padding:"16px 18px",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)"}}>
          <div style={{color:"#fff",fontWeight:700,fontSize:12,letterSpacing:3,marginBottom:12}}>УПРАВЛЕНИЕ</div>
          {[["WASD / Стрелки","Движение"],["ЛКМ","Стрельба"],["R","Перезарядка"],["S","Присесть"],["ESC / P","Пауза"]].map(([k,a])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
              <span style={{color:"#555",fontSize:13}}>{a}</span>
              <span style={{color:"#fff",fontSize:12,fontWeight:700,padding:"3px 10px",borderRadius:6,background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.12)"}}>{k}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return null;
}