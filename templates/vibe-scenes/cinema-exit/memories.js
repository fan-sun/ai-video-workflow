// 用途：为持续牵引提供沿途经历，背景亮度和停留低于人物、绳与投入。
// 运行：opening.js之后加载，由drawOpening调用drawMemories。
// 依赖：现有纸张、金属与花束形象；年份是辅助标记，不替换主字幕。
const memoryFlower=group(memories,'memory-flowers');
const flowerSprites=[];
for(let i=0;i<5;i++){
 const x=[-80,-34,14,66,2][i],y=[-76,-142,-116,-69,-195][i];
 node('path',{d:`M0 188Q${x*.3} 25 ${x} ${y}`,fill:'none',stroke:'#728b75','stroke-width':6},memoryFlower);
 const f=group(memoryFlower);set(f,{transform:`translate(${x} ${y})`});
 for(let j=0;j<5;j++)node('ellipse',{cx:0,cy:-22,rx:23,ry:30,transform:`rotate(${j*72})`,fill:i%2?'#d9b783':'#bc8875',stroke:'#e1c29a','stroke-width':1},f);
 node('circle',{r:17,fill:'#e2c689'},f);flowerSprites.push({g:f,x,y});
}
node('path',{d:'M-134-31L0 221 133-30 42 10 0-5-40 13Z',fill:'url(#paper)',stroke:'#c9c2a2','stroke-width':2},memoryFlower);
node('path',{d:'M-41 140Q-128 71-74 57Q-18 52 0 151Q22 48 75 57Q133 76 40 140 M0 151L-24 200 M0 151L30 193',fill:'none',stroke:'#aa8050','stroke-width':13,'stroke-linecap':'round'},memoryFlower);
const memoryNight=group(memories,'memory-night-trip');
node('circle',{cx:330,cy:-168,r:45,fill:'#b4c2b7',opacity:.5},memoryNight);
for(let i=0;i<7;i++)node('rect',{x:-530+i*160,y:-130-(i%3)*42,width:95,height:290+(i%3)*42,fill:'#41606b',opacity:.45},memoryNight);
const nightBus=group(memoryNight,'memory-bus');
node('path',{d:'M-420 60V-73Q-419-118-361-120H286Q329-122 352-75L395 25V79H-420Z',fill:'#617e85',stroke:'#a7b9b4','stroke-width':4},nightBus);
for(let i=0;i<6;i++)node('rect',{x:-390+i*103,y:-91,width:86,height:89,rx:5,fill:'#213e49',stroke:'#839995','stroke-width':2},nightBus);
node('path',{d:'M246-92H289Q315-84 326-51L349 4H246Z',fill:'#b0b99d'},nightBus);
node('path',{d:'M-410 31H354',stroke:'#c3b28c','stroke-width':9},nightBus);
node('path',{d:'M368 39L825 92V7L368 22Z',fill:'url(#door-light)'},nightBus);
const busWheels=[];for(const x of[-261,245]){const g=group(nightBus);set(g,{transform:`translate(${x} 80)`});node('circle',{r:59,fill:'#0b2330',stroke:'#6e8890','stroke-width':6},g);const spoke=group(g);node('circle',{r:28,fill:'url(#metal)'},spoke);node('path',{d:'M-27 0H27 M0-27V27',stroke:'#152e39','stroke-width':6},spoke);busWheels.push(spoke)}
const memoryTime=group(memories,'memory-days');
const calendarLeaves=[];
for(let i=0;i<5;i++){
 const g=group(memoryTime);node('path',{d:'M-160-178H160V145H-160Z',fill:'url(#paper)',stroke:'#7f9994','stroke-width':3},g);
 node('path',{d:'M-160-120H160',stroke:'#a88d62','stroke-width':25},g);
 for(let row=0;row<4;row++)for(let col=0;col<5;col++)node('rect',{x:-120+col*52,y:-77+row*46,width:20,height:18,rx:2,fill:'#648180',opacity:.65},g);
 for(const x of[-90,90])node('path',{d:`M${x}-194V-154`,stroke:'#c4c8ab','stroke-width':13,'stroke-linecap':'round'},g);
 calendarLeaves.push(g);
}
const gift=group(memoryTime,'memory-gift');
node('path',{d:'M-101-48H102V111H-101Z M-114-71H114V-32H-114Z',fill:'#6e8381',stroke:'#c5bd99','stroke-width':4},gift);
node('path',{d:'M-15-68H17V111H-15Z',fill:'#ba9962'},gift);
node('path',{d:'M0-68Q-112-160-99-103Q-82-54 0-68Q111-151 97-96Q74-61 0-68',fill:'none',stroke:'#c7aa70','stroke-width':12},gift);
const memoryYears=group(pullCamera,'memory-years');
const yearMarks=[1,2,3].map(n=>{const e=label(memoryYears,n+'年',940,245,'display');e.style.fontSize='138px';return e});

function drawMemories(t,travel){
 const window=(start,end)=>progress(t,start,.22)*(1-progress(t,end-.28,.28));
 // 三段经历经过同一条运动路线，主线人物和绳子从不中断。
 const flowerAlpha=window(1.62,2.92),nightAlpha=window(2.4,3.78),timeAlpha=window(3.22,4.68);
 const xFlower=travel+1300-(t-1.62)*800;
 move(memoryFlower,xFlower,452,1.16,-9+8*Math.sin(t*2));show(memoryFlower,flowerAlpha*.43);
 flowerSprites.forEach((f,i)=>move(f.g,f.x,f.y,1,Math.sin(t*5+i)*7));
 move(memoryNight,travel+1420-(t-2.4)*1280,486,.83);show(memoryNight,nightAlpha*.4);
 move(nightBus,45*Math.sin(t*2),0,1,-1.3);busWheels.forEach(e=>set(e,{transform:`rotate(${t*510})`}));
 move(memoryTime,travel+1240-(t-3.22)*1120,458,.9);show(memoryTime,timeAlpha*.4);
 calendarLeaves.forEach((e,i)=>{const u=progress(t,3.28+i*.13,.62);move(e,-u*360-i*20,-u*80+i*8,1,-u*54-i*3);show(e,1-u*.6)});
 move(gift,325,93,.82,10*Math.sin(t));
 const yearWindows=[[1.66,2.67],[2.53,3.5],[3.4,4.55]];
 yearMarks.forEach((e,i)=>{const[a,b]=yearWindows[i];set(e,{x:travel+1010-(t-a)*105,y:245});show(e,window(a,b)*.38)});
 return{flowers:flowerAlpha,night_trip:nightAlpha,calendar:timeAlpha};
}
