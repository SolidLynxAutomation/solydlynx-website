// Cena 3D do hero: do desenho 3D de um móvel à lateral maquinada em tempo real.
// O desenho já traz as operações (furação para suportes e dobradiças, cavilhas nos topos e rasgo
// para as costas); a automação gera os programas e a máquina executa-os.
// Os cortes são reais (CSG): a geometria da peça muda a cada operação.
import {
  ACESFilmicToneMapping, AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color,
  CurvePath, CylinderGeometry, DirectionalLight, DynamicDrawUsage, ExtrudeGeometry, Fog, Group, HemisphereLight,
  InstancedMesh, LineCurve3, MathUtils, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PCFSoftShadowMap,
  PerspectiveCamera, PlaneGeometry, PMREMGenerator, Points, PointsMaterial, Scene, Shape, SRGBColorSpace, Sprite,
  SpriteMaterial, TubeGeometry, Vector3, WebGLRenderer, GridHelper, type Material,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import { LatheGeometry, Vector2, LineSegments, EdgesGeometry, LineBasicMaterial, RingGeometry, DoubleSide } from "three";

// 1 unidade = 100 mm
const L = 7, P = 4, T = 0.25;
const MARGEM = 0.3, KERF = 0.04;
const BG = 0x1b1c1f, LARANJA = 0xff6a13;

type Ops = {
  estado: (n: number, nome: string) => void; concluido: () => void; coords: (v: Vector3) => void;
  ficheiro: (nome: string) => void; enviarFicheiro: (alvo: { x: number; y: number }) => number; limparFicheiro: () => void;
};

export function iniciar(host: HTMLElement, ui: Ops, { animar = true } = {}) {
  // ---------- renderizador, cena e câmara ----------
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.domElement.className = "m3d-canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color(BG);
  scene.fog = new Fog(BG, 24, 42);
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  const camera = new PerspectiveCamera(30, 1.5, 0.1, 80);

  scene.add(new HemisphereLight(0xdfe6ff, 0x1a1b1e, 0.45));
  const sol = new DirectionalLight(0xfff6ec, 1.9);
  sol.position.set(5, 11, 6);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
  sol.shadow.bias = -0.0004;
  sol.shadow.radius = 4;
  scene.add(sol);
  const recorte = new DirectionalLight(0xffd2b0, 0.6);
  recorte.position.set(-6, 4, -5);
  scene.add(recorte);

  // ---------- mesa da máquina ----------
  const mesa = new Mesh(new PlaneGeometry(60, 60), new MeshStandardMaterial({ color: 0x1e1f22, roughness: 0.95 }));
  mesa.rotation.x = -Math.PI / 2;
  mesa.position.y = -2.4;
  mesa.receiveShadow = true;
  scene.add(mesa);
  const grelha = new GridHelper(40, 80, 0x34363b, 0x27292d);
  grelha.position.y = -2.398;
  scene.add(grelha);

  // ---------- materiais ----------
  const melamina = new MeshStandardMaterial({ color: 0xcfcac0, roughness: 0.55, metalness: 0 });
  const aglomerado = new MeshStandardMaterial({ color: 0xa8875f, roughness: 0.95 });
  const corpo = new MeshStandardMaterial({ color: 0x3a3d43, roughness: 0.35, metalness: 0.75 });
  const corpoClaro = new MeshStandardMaterial({ color: 0x8d9097, roughness: 0.3, metalness: 0.9 });
  const anel = new MeshStandardMaterial({ color: LARANJA, emissive: LARANJA, emissiveIntensity: 0.8 });
  const percursoMat = new MeshBasicMaterial({ color: LARANJA, toneMapped: false, transparent: true });

  // ---------- peça (CSG) e sobra do contorno ----------
  const ev = new Evaluator();
  let peca: Brush;
  const novaPeca = () => {
    if (peca) { scene.remove(peca); peca.geometry.dispose(); }
    peca = new Brush(new BoxGeometry(L, T, P), melamina);
    peca.position.y = T / 2;
    peca.castShadow = peca.receiveShadow = true;
    peca.updateMatrixWorld();
    scene.add(peca);
  };
  // `base`: peça de partida do corte. No corte progressivo do rasgo recorta-se sempre a
  // mesma base com uma forma cada vez maior, para não acumular faces coincidentes.
  const cortar = (geo: BufferGeometry, pos: Vector3, rx = 0, rz = 0, base: Brush = peca) => {
    const b = new Brush(geo, aglomerado);
    b.position.copy(pos);
    b.rotation.set(rx, 0, rz);
    b.updateMatrixWorld();
    const r = ev.evaluate(base, b, SUBTRACTION);
    r.castShadow = r.receiveShadow = true;
    scene.remove(peca);
    if (peca !== base) peca.geometry.dispose();
    geo.dispose();
    peca = r;
    scene.add(peca);
  };

  // A chapa em bruto = peça + moldura de sobra + "pontes" no corte (que desaparecem à passagem da fresa)
  const sobraShape = new Shape();
  const ow = L / 2 + MARGEM, od = P / 2 + MARGEM, iw = L / 2 + KERF, id = P / 2 + KERF;
  sobraShape.moveTo(-ow, -od); sobraShape.lineTo(ow, -od); sobraShape.lineTo(ow, od); sobraShape.lineTo(-ow, od); sobraShape.lineTo(-ow, -od);
  const furoSobra = new Shape();
  furoSobra.moveTo(-iw, -id); furoSobra.lineTo(-iw, id); furoSobra.lineTo(iw, id); furoSobra.lineTo(iw, -id); furoSobra.lineTo(-iw, -id);
  sobraShape.holes.push(furoSobra);
  const sobraMat = melamina.clone();
  const sobra = new Mesh(new ExtrudeGeometry(sobraShape, { depth: T, bevelEnabled: false }), [sobraMat, sobraMat]);
  sobra.rotation.x = -Math.PI / 2;
  sobra.castShadow = sobra.receiveShadow = true;
  scene.add(sobra);

  // percurso do contorno (centro do corte)
  const k = KERF / 2;
  const cantos = [
    new Vector3(-L / 2 - k, T, -P / 2 - k), new Vector3(L / 2 + k, T, -P / 2 - k),
    new Vector3(L / 2 + k, T, P / 2 + k), new Vector3(-L / 2 - k, T, P / 2 + k), new Vector3(-L / 2 - k, T, -P / 2 - k),
  ];
  const perimetro = cantos.slice(1).reduce((s, p, i) => s + p.distanceTo(cantos[i]), 0);
  const NP = 140;
  const pontes = new InstancedMesh(new BoxGeometry(1, T, 1), melamina, NP);
  pontes.castShadow = pontes.receiveShadow = true;
  {
    const o = new Object3D();
    const passo = perimetro / NP;
    // ordem inversa: reduzir `count` remove as pontes já cortadas (as primeiras do percurso)
    for (let i = 0; i < NP; i++) {
      const d = (NP - 1 - i + 0.5) * passo;
      const { p, dir } = noPercurso(cantos, d);
      o.position.set(p.x, T / 2, p.z);
      o.rotation.set(0, Math.atan2(-dir.z, dir.x), 0);
      o.scale.set(passo * 1.02, 1, KERF + 0.004);
      o.updateMatrix();
      pontes.setMatrixAt(i, o.matrix);
    }
  }
  scene.add(pontes);

  // ---------- percursos (linhas laranja reveladas à medida que a fresa avança) ----------
  const tubo = (pts: Vector3[], segs: number) => {
    const c = new CurvePath<Vector3>();
    for (let i = 1; i < pts.length; i++) c.add(new LineCurve3(pts[i - 1], pts[i]));
    const m = new Mesh(new TubeGeometry(c, segs, 0.011, 6, false), percursoMat);
    m.userData.total = segs * 6 * 6;
    m.geometry.setDrawRange(0, 0);
    scene.add(m);
    return m;
  };
  const revela = (m: Mesh, t: number) => m.geometry.setDrawRange(0, Math.floor(t * (m.userData.total / 36)) * 36);
  const tpContorno = tubo(cantos.map(p => p.clone().setY(T + 0.006)), 240);

  // rasgo (traseiro, ao longo de x)
  const RZ = -P / 2 + 0.2, RW = 0.08, RD = 0.1;
  const tpRasgo = tubo([new Vector3(-L / 2 - 0.15, T + 0.006, RZ), new Vector3(L / 2 + 0.15, T + 0.006, RZ)], 60);

  // ---------- operações de uma lateral (montada entre a base e o topo) ----------
  // furos de suporte de prateleira: duas filas a 37 mm das arestas, passo de 32 mm
  const suportes = [-P / 2 + 0.37, P / 2 - 0.37].flatMap(z => [-0.96, -0.64, -0.32, 0, 0.32, 0.64, 0.96].map(x => ({ x, z, r: 0.03, d: 0.12 })));
  // furos das bases das dobradiças: pares a 37 mm da frente, junto às extremidades
  const dobradicas = [-2.5, -2.18, 2.18, 2.5].map(x => ({ x, z: P / 2 - 0.37, r: 0.03, d: 0.12 }));
  const verticais = [...suportes, ...dobradicas].sort((a, b) => a.z - b.z || a.x - b.x);
  // cavilhas nos topos da lateral (ligam à base e ao topo)
  const topos = [L / 2, -L / 2].flatMap(x => [1.4, 0, -1.4].map(z => ({ x, z, r: 0.04, d: 0.3 })));

  const antesMaquina = new Set(scene.children);
  // ---------- máquina: centro de maquinação de barras (pórtico móvel ao longo da base) ----------
  const branco = new MeshStandardMaterial({ color: 0xe4e6e9, roughness: 0.4, metalness: 0.1 });
  const cinzaClaro = new MeshStandardMaterial({ color: 0xb9bdc3, roughness: 0.45, metalness: 0.35 });
  const grafite = new MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.55, metalness: 0.35 });
  const preto = new MeshStandardMaterial({ color: 0x141518, roughness: 0.7, metalness: 0.2 });
  const aluminio = new MeshStandardMaterial({ color: 0xaeb3ba, roughness: 0.3, metalness: 0.85 });
  const vidro = new MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.85 });
  const borracha = new MeshStandardMaterial({ color: 0x0f1012, roughness: 0.95 });
  const brocaMat = new MeshStandardMaterial({ color: 0xd6d9de, roughness: 0.2, metalness: 1, flatShading: true });
  const mangueiraMat = new MeshStandardMaterial({ color: 0x8f8a80, roughness: 0.75, metalness: 0.1 });
  const caixa3 = (w: number, h: number, d: number, m: Material, x: number, y: number, z: number, pai: Object3D = scene) => {
    const o = new Mesh(new BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    pai.add(o);
    return o;
  };
  const cil = (r: number, h: number, m: Material, x: number, y: number, z: number, pai: Object3D = scene, seg = 32) => {
    const o = new Mesh(new CylinderGeometry(r, r, h, seg), m);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    pai.add(o);
    return o;
  };
  const logoMat = (() => {
    const c = document.createElement("canvas"); c.width = 1024; c.height = 128;
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    const img = new Image();
    img.onload = () => {
      const x = c.getContext("2d")!;
      const h = 92, w = (img.width / img.height) * h;
      x.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
      t.needsUpdate = true;
    };
    img.src = "/logo.webp";
    return new MeshBasicMaterial({ map: t, transparent: true, toneMapped: false });
  })();

  // base comprida (o pórtico corre ao longo de x) e mesa de barras
  const CHAO = -2.4, ZP = P / 2 + 1.7, XB = 7.4;
  caixa3(XB * 2, 1.4, ZP * 2 + 1.2, grafite, 0, CHAO + 0.7, 0);
  caixa3(XB * 2 + 0.02, 0.5, 0.06, branco, 0, CHAO + 1.05, ZP + 0.625);
  caixa3(XB * 2 + 0.04, 0.07, 0.07, anel, 0, CHAO + 0.75, ZP + 0.64); // friso laranja
  for (const z of [-ZP, ZP]) {
    caixa3(XB * 2 - 0.04, 0.5, 0.7, branco, 0, -0.95, z); // apoios das guias
    caixa3(XB * 2 - 0.08, 0.12, 0.3, aluminio, 0, -0.635, z); // guias do pórtico
  }
  for (const z of [-2.2, 2.2]) caixa3(10.6, 0.14, 0.3, aluminio, 0, -0.8, z);
  for (const x of [-3.2, -1.6, 0, 1.6, 3.2]) {
    caixa3(0.42, 0.2, 5.6, cinzaClaro, x, -0.62, 0); // barra
    for (const z of [-1.3, 1.3]) {
      caixa3(0.36, 0.38, 0.5, preto, x, -0.3, z); // ventosa
      caixa3(0.38, 0.06, 0.52, borracha, x, -0.06, z);
    }
  }
  for (const x of [-3.6, 3.6]) caixa3(0.12, 0.35, 0.12, aluminio, x, -0.12, -P / 2 - 0.45); // batentes

  // pórtico (move-se em x): pilares atrás e à frente, trave com cobertura
  const portico = new Group();
  scene.add(portico);
  for (const z of [-ZP, ZP]) {
    caixa3(1.1, 0.35, 0.8, grafite, 0, -0.4, z, portico); // patins
    caixa3(0.95, 4.16, 0.62, branco, 0, 1.72, z, portico); // pilar
  }
  caixa3(0.12, 3.6, 0.2, preto, 0.53, 1.65, ZP + 0.22, portico); // proteção do pilar da frente
  caixa3(0.9, 2.2, 0.04, vidro, 0, 1.9, ZP + 0.345, portico);
  caixa3(1.0, 0.9, ZP * 2 + 0.8, branco, 0, 3.75, 0, portico); // trave
  caixa3(1.02, 0.1, ZP * 2 + 0.82, anel, 0, 3.3, 0, portico); // friso
  caixa3(0.7, 0.35, ZP * 2 + 0.2, cinzaClaro, -0.1, 4.37, 0, portico); // calha da corrente
  caixa3(0.02, 0.6, 3.8, grafite, 0.505, 3.82, 0.9, portico); // placa do logótipo
  const logo = new Mesh(new PlaneGeometry(3.4, 0.42), logoMat);
  logo.rotation.y = Math.PI / 2;
  logo.position.set(0.52, 3.82, 0.9);
  portico.add(logo);

  // carro (move-se em z ao longo da trave)
  const carro = new Group();
  portico.add(carro);
  caixa3(0.3, 1.3, 1.25, cinzaClaro, 0.69, 3.65, 0, carro);
  // corrente porta-cabos: elos que acompanham o carro
  const NEL = 44, CR_ = 0.22, LC = 6.0, ZFIX = 0.3;
  const elos = new InstancedMesh(new BoxGeometry(0.34, 0.14, ((LC + Math.PI * CR_) / NEL) * 0.9), preto, NEL);
  elos.castShadow = true;
  scene.add(elos);

  // cabeça (move-se em y). Origem = ponta da fresa
  const cabeca = new Group();
  scene.add(cabeca);
  caixa3(0.14, 3.0, 0.9, aluminio, -0.42, 2.75, 0, cabeca); // corrediça vertical
  caixa3(1.95, 0.75, 1.0, branco, 0.5, 2.05, 0, cabeca); // carenagem
  caixa3(1.97, 0.07, 1.02, anel, 0.5, 1.7, 0, cabeca);
  caixa3(0.02, 0.4, 0.8, vidro, 1.485, 2.12, 0, cabeca);
  // eletromandril com coifa de aspiração (sobe quando trabalha o grupo de furação)
  const mandril = new Group();
  cabeca.add(mandril);
  const fresa = new Mesh(new CylinderGeometry(0.03, 0.03, 0.42, 6).translate(0, 0.21, 0), brocaMat);
  fresa.castShadow = true;
  mandril.add(fresa);
  cil(0.13, 0.2, aluminio, 0, 0.52, 0, mandril);
  cil(0.29, 0.05, anel, 0, 0.645, 0, mandril, 48);
  cil(0.28, 0.95, corpo, 0, 1.14, 0, mandril, 48);
  for (let i = 0; i < 5; i++) cil(0.31, 0.025, corpoClaro, 0, 0.98 + i * 0.07, 0, mandril, 48);
  const coifa = new Mesh(new CylinderGeometry(0.4, 0.44, 0.16, 32, 1, true), borracha);
  coifa.position.set(0, 0.74, 0);
  mandril.add(coifa);
  // mangueira de aspiração (corrugada), a subir da cabeça
  {
    const perfil: Vector2[] = [];
    for (let i = 0; i <= 160; i++) { const y = i * 0.04; perfil.push(new Vector2(0.19 + 0.018 * Math.sin(i * 1.6), y)); }
    const m = new Mesh(new LatheGeometry(perfil, 20), mangueiraMat);
    m.position.set(0.55, 2.4, -0.1);
    m.castShadow = true;
    cabeca.add(m);
  }
  // grupo de furação (atrás da fresa, em z)
  const BX = 1.0;
  // bloco de furação: preso à carenagem (sem vão)
  caixa3(0.75, 1.36, 0.75, grafite, BX, 1.02, 0, cabeca);
  caixa3(0.77, 0.05, 0.77, anel, BX, 0.36, 0, cabeca);
  // mandris das brocas horizontais
  cil(0.08, 0.1, aluminio, BX - 0.425, 0.5, 0, cabeca, 20).rotation.z = Math.PI / 2;
  cil(0.08, 0.1, aluminio, BX + 0.425, 0.5, 0, cabeca, 20).rotation.z = Math.PI / 2;
  const RET = 0.3, EXT = -0.3;
  const brocaV = (r: number, x: number, z: number) => {
    const m = new Mesh(new CylinderGeometry(r, r * 0.9, 0.9, 6).translate(0, 0.45, 0), brocaMat);
    m.position.set(x, RET, z);
    m.castShadow = true;
    cabeca.add(m);
    return m;
  };
  const bPequena = brocaV(0.03, BX + 0.2, 0.2);
  for (const [x, z] of [[BX - 0.2, 0.2], [BX + 0.2, -0.2], [BX - 0.2, -0.2], [BX, 0]]) brocaV(0.03, x, z);
  // brocas horizontais: uma para cada lado (-x e +x)
  const bMenos = new Mesh(new CylinderGeometry(0.045, 0.045, 0.4, 6).rotateZ(Math.PI / 2), brocaMat);
  bMenos.position.set(BX - 0.575, 0.5, 0);
  const bMais = new Mesh(new CylinderGeometry(0.045, 0.045, 0.4, 6).rotateZ(Math.PI / 2), brocaMat);
  bMais.position.set(BX + 0.575, 0.5, 0);
  cabeca.add(bMenos, bMais);

  type Ferr = "fresa" | "pequena" | "menos" | "mais";
  const ponta = (f: Ferr) =>
    f === "fresa" ? new Vector3(0, mandril.position.y, 0)
    : f === "pequena" ? bPequena.position.clone()
    : f === "menos" ? new Vector3(BX - 0.775, 0.5, 0)
    : new Vector3(BX + 0.775, 0.5, 0);
  const giratoria = (f: Ferr) => ({ fresa, pequena: bPequena, menos: bMenos, mais: bMais })[f];

  // tudo o que pertence à máquina fica num grupo, para a máquina poder entrar e sair de cena
  const maquina = new Group();
  for (const o of scene.children.filter(o => !antesMaquina.has(o))) maquina.add(o);
  scene.add(maquina);

  // brilho no ponto de corte
  const glowTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d")!;
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,170,90,1)"); g.addColorStop(0.35, "rgba(255,106,19,.55)"); g.addColorStop(1, "rgba(255,106,19,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new CanvasTexture(c);
  })();
  const brilho = new Sprite(new SpriteMaterial({ map: glowTex, blending: AdditiveBlending, depthWrite: false, transparent: true }));
  brilho.scale.setScalar(0.5);
  brilho.visible = false;
  scene.add(brilho);

  // aparas
  const NA = 420;
  const aparasPos = new Float32Array(NA * 3).fill(-99);
  const aparasVel = new Float32Array(NA * 3);
  const aparasVida = new Float32Array(NA);
  const aparasGeo = new BufferGeometry();
  aparasGeo.setAttribute("position", new BufferAttribute(aparasPos, 3).setUsage(DynamicDrawUsage));
  const aparas = new Points(aparasGeo, new PointsMaterial({ color: 0xd9c29b, size: 0.035, sizeAttenuation: true }));
  aparas.frustumCulled = false;
  scene.add(aparas);
  let aparaI = 0;
  const emitir = (p: Vector3, n: number, dir?: Vector3) => {
    for (let j = 0; j < n; j++) {
      const i = (aparaI = (aparaI + 1) % NA);
      aparasPos.set([p.x, p.y + 0.02, p.z], i * 3);
      const a = Math.random() * Math.PI * 2, v = 0.8 + Math.random() * 1.6;
      aparasVel.set([Math.cos(a) * v + (dir?.x ?? 0), 1.2 + Math.random() * 2, Math.sin(a) * v + (dir?.z ?? 0)], i * 3);
      aparasVida[i] = 0.5 + Math.random() * 0.6;
    }
  };

  // ---------- estado da animação ----------
  let ativa: Ferr = "fresa";
  let cortando = false;
  const pos = new Vector3();
  // A posição pedida é a da ponta da ferramenta ativa; a cabeça, o carro e o pórtico seguem-na.
  const coloca = (p: Vector3) => {
    pos.copy(p);
    cabeca.position.copy(p).sub(ponta(ativa));
    portico.position.x = cabeca.position.x - 1.35;
    carro.position.z = cabeca.position.z;
    atualizaCorrente();
    ui.coords(p);
  };
  // corrente porta-cabos: sai do fundo da trave e dobra em U até ao carro
  function atualizaCorrente() {
    // parte fixa no meio da calha; a dobra anda a metade da velocidade do carro
    const o = new Object3D();
    const zc = carro.position.z, y0 = 4.62;
    const zf = (ZFIX + zc - LC) / 2, A = ZFIX - zf, passo = (LC + Math.PI * CR_) / NEL;
    for (let i = 0; i < NEL; i++) {
      const d = (i + 0.5) * passo;
      let y = y0, z: number, rot = 0;
      if (d < A) z = ZFIX - d;
      else if (d < A + Math.PI * CR_) { const a = (d - A) / CR_; z = zf - Math.sin(a) * CR_; y = y0 + CR_ - Math.cos(a) * CR_; rot = -a; }
      else { z = zf + (d - A - Math.PI * CR_); y = y0 + 2 * CR_; rot = Math.PI; }
      o.position.set(portico.position.x - 0.1, y, z);
      o.rotation.set(rot, 0, 0);
      o.updateMatrix();
      elos.setMatrixAt(i, o.matrix);
    }
    elos.instanceMatrix.needsUpdate = true;
  }
  // muda de ferramenta sem mover a cabeça
  const usar = (f: Ferr) => { ativa = f; pos.copy(cabeca.position).add(ponta(f)); };
  // o eletromandril sobe para dar espaço ao grupo de furação
  const recolhe = (sim: boolean) => {
    const de = mandril.position.y, para = sim ? 0.8 : 0;
    return durante(0.35, k => { mandril.position.y = de + (para - de) * suave(k); pos.copy(cabeca.position).add(ponta(ativa)); });
  };
  // as brocas verticais descem do grupo de furação
  const desce = (b: Mesh, sim: boolean) => {
    const de = b.position.y, para = sim ? EXT : RET;
    return durante(0.3, k => { b.position.y = de + (para - de) * suave(k); pos.copy(cabeca.position).add(ponta(ativa)); });
  };
  const CASA = new Vector3(-5.0, T + 1.4, -0.4);

  const suave = (k: number) => k * k * (3 - 2 * k);
  type Tarefa = { dur: number; t: number; fn: (k: number) => void; fim: () => void };
  let tarefas: Tarefa[] = [];
  const durante = (dur: number, fn: (k: number) => void) =>
    new Promise<void>(fim => tarefas.push({ dur: Math.max(dur, 0.001), t: 0, fn, fim }));
  const espera = (s: number) => durante(s, () => {});
  const move = (to: Vector3, vel: number, cb?: (k: number) => void) => {
    const de = pos.clone(), d = de.distanceTo(to);
    return durante(d / vel, k => { coloca(de.clone().lerp(to, k)); cb?.(k); });
  };
  const rapido = (to: Vector3) => { const de = pos.clone(); return durante(Math.max(0.35, de.distanceTo(to) / 9), k => coloca(de.clone().lerp(to, suave(k)))); };
  async function percorrer(pts: Vector3[], vel: number, tp: Mesh, aoAvancar?: (dist: number) => void) {
    const segs = pts.slice(1).map((p, i) => p.distanceTo(pts[i]));
    const total = segs.reduce((a, b) => a + b, 0);
    let feito = 0;
    for (let i = 1; i < pts.length; i++) {
      const base = feito, s = segs[i - 1];
      await move(pts[i], vel, k => { revela(tp, (base + s * k) / total); aoAvancar?.(base + s * k); });
      feito += s;
    }
  }
  const SEG = T + 0.5;

  // ---------- antes da máquina: do desenho 3D da peça ao programa ----------
  const movel = new Group();
  movel.position.set(0, 0.6, 0.3);
  movel.scale.setScalar(0.48);
  scene.add(movel);
  const arestaMat = new LineBasicMaterial({ color: 0xd9d6cf, transparent: true, opacity: 0, toneMapped: false });
  type Parte = { mesh: Mesh; mats: MeshStandardMaterial[]; nome: string };
  const partes: Parte[] = [];
  const transparente = (m: MeshStandardMaterial) => { const c = m.clone(); c.transparent = true; c.opacity = 0; return c; };
  // peça desenhada com as suas operações (cortes por CSG); as arestas mostram só o contorno
  type Corte = { geo: BufferGeometry; x: number; y: number; z: number; rx?: number; rz?: number };
  const desenhar = (w: number, h: number, d: number, cortes: Corte[], mats: MeshStandardMaterial[]) => {
    let b = new Brush(new BoxGeometry(w, h, d), mats[0]);
    b.updateMatrixWorld();
    for (const c of cortes) {
      const k2 = new Brush(c.geo, mats[1] ?? mats[0]);
      k2.position.set(c.x, c.y, c.z);
      k2.rotation.set(c.rx ?? 0, 0, c.rz ?? 0);
      k2.updateMatrixWorld();
      b = ev.evaluate(b, k2, SUBTRACTION);
    }
    return b.geometry;
  };
  const parte = (nome: string, w: number, h: number, d: number, cortes: Corte[]) => {
    const mats = [transparente(melamina), transparente(aglomerado)];
    const geo = cortes.length ? desenhar(w, h, d, cortes, mats) : new BoxGeometry(w, h, d);
    const mesh = new Mesh(geo, cortes.length ? mats : mats[0]);
    mesh.castShadow = true;
    mesh.add(new LineSegments(new EdgesGeometry(new BoxGeometry(w, h, d)), arestaMat));
    movel.add(mesh);
    const pt: Parte = { mesh, mats, nome };
    partes.push(pt);
    return pt;
  };
  const cilindro = (r: number, d: number) => new CylinderGeometry(r, r, d * 2, r > 0.1 ? 40 : 14);

  // lateral direita (a que vai à máquina). Eixos locais: x = espessura (face interior em -T/2),
  // y = comprimento (= -x da máquina), z = largura (= z da máquina)
  const latParte = parte("Lateral dir.", T, L, P, [
    ...verticais.map(h => ({ geo: cilindro(h.r, h.d), x: -T / 2, y: -h.x, z: h.z, rz: Math.PI / 2 })),
    ...topos.map(h => ({ geo: cilindro(h.r, h.d), x: 0, y: -h.x, z: h.z })),
    { geo: new BoxGeometry(RD * 2, L + 0.4, RW), x: -T / 2, y: 0, z: RZ },
  ]);
  const lateral = latParte.mesh;
  lateral.rotation.y = 2.62; // face interior (com as operações) virada para a câmara
  const opacidade = (pt: Parte, o: number) => pt.mats.forEach(m => (m.opacity = o));

  // cotas do desenho (mm), em estilo de desenho técnico
  const cotaMat = new LineBasicMaterial({ color: LARANJA, transparent: true, opacity: 0, toneMapped: false });
  const cotas = new Group();
  lateral.add(cotas);
  const textoCota = (txt: string) => {
    const c = document.createElement("canvas"); c.width = 256; c.height = 96;
    const x = c.getContext("2d")!;
    x.font = "500 64px 'JetBrains Mono', monospace"; x.fillStyle = "#ff6a13"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(txt, 128, 50);
    const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace;
    const sp = new Sprite(new SpriteMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    sp.scale.set(1.6, 0.6, 1);
    return sp;
  };
  const cota = (a: Vector3, b: Vector3, desvio: Vector3, txt: string) => {
    const a2 = a.clone().add(desvio), b2 = b.clone().add(desvio), t = desvio.clone().setLength(0.18);
    const pts = [a, a2.clone().add(t), b, b2.clone().add(t), a2, b2];
    const g = new BufferGeometry().setFromPoints(pts);
    cotas.add(new LineSegments(g, cotaMat));
    const sp = textoCota(txt);
    sp.position.copy(a2.clone().lerp(b2, 0.5).add(desvio.clone().setLength(0.55)));
    cotas.add(sp);
  };
  const xc = -T / 2;
  cota(new Vector3(xc, -L / 2, P / 2), new Vector3(xc, L / 2, P / 2), new Vector3(0, 0, 0.9), String(L * 100));
  cota(new Vector3(xc, -L / 2, -P / 2), new Vector3(xc, -L / 2, P / 2), new Vector3(0, -0.9, 0), String(P * 100));
  const opCotas = (o: number) => { cotaMat.opacity = o; for (const c of cotas.children) if (c instanceof Sprite) c.material.opacity = o; };

  // Programa: percursos da ferramenta (laranja) desenhados sobre a face interior da lateral
  const marcaMat = new MeshBasicMaterial({ color: LARANJA, toneMapped: false, transparent: true, opacity: 1, side: DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const programa = new Group();
  lateral.add(programa);
  const traços: Object3D[] = [];
  const XF = -(T / 2 + 0.025);
  const fita = (y0: number, z0: number, y1: number, z1: number, larg = 0.035) => {
    const len = Math.hypot(y1 - y0, z1 - z0);
    const m = new Mesh(new BoxGeometry(0.004, len, larg), marcaMat);
    m.position.set(XF, (y0 + y1) / 2, (z0 + z1) / 2);
    m.rotation.x = Math.atan2(z1 - z0, y1 - y0);
    m.renderOrder = 3;
    return m;
  };
  const anelEm = (r: number, x: number, y: number, z: number, eixo: "x" | "y") => {
    const m = new Mesh(new RingGeometry(r + 0.02, r + 0.055, 28), marcaMat);
    if (eixo === "x") m.rotation.y = Math.PI / 2; else m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.renderOrder = 3;
    return m;
  };
  const grupoTraço = (filhos: Object3D[]) => { const g = new Group(); g.add(...filhos); g.visible = false; programa.add(g); traços.push(g); return g; };
  const e = 0.06;
  grupoTraço([fita(-L / 2 - e, -P / 2 - e, L / 2 + e, -P / 2 - e), fita(L / 2 + e, -P / 2 - e, L / 2 + e, P / 2 + e), fita(L / 2 + e, P / 2 + e, -L / 2 - e, P / 2 + e), fita(-L / 2 - e, P / 2 + e, -L / 2 - e, -P / 2 - e)]);
  for (const h of verticais) grupoTraço([anelEm(h.r, XF, -h.x, h.z, "x")]);
  for (const h of topos) grupoTraço([anelEm(h.r, 0, -h.x + Math.sign(-h.x) * 0.025, h.z, "y")]);
  grupoTraço([fita(L / 2 + 0.15, RZ, -L / 2 - 0.15, RZ)]);

  // ponto do ecrã para onde voa o ficheiro: a cabeça da máquina
  const pontoCabeca = () => {
    const v = cabeca.position.clone().add(new Vector3(0.5, 2.05, 0)); v.project(camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
  };

  let soArestas = true; // só na fase do desenho as arestas aparecem sem as peças
  const cubica = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

  async function preludio() {
    // 01 desenho 3D: a peça em vista de raio-X, com as cotas e as operações (furos, cavilhas e rasgo)
    camDestino("desenho");
    ui.estado(1, "Desenho 3D · lateral");
    movel.rotation.y = 0.5;
    const roda = durante(4.6, k => (movel.rotation.y = 0.5 * (1 - cubica(k)))); // mesa giratória
    await durante(0.9, k => (arestaMat.opacity = cubica(k) * 0.9));
    await durante(0.9, k => { opacidade(latParte, 0.35 * cubica(k)); opCotas(cubica(k)); });
    await roda;
    // 02 automação: a peça ganha corpo e são calculados os percursos da ferramenta
    ui.estado(2, "Automação · percursos");
    soArestas = false;
    await durante(0.7, k => { opacidade(latParte, 0.35 + 0.65 * k); opCotas(1 - k); arestaMat.opacity = 0.9 * (1 - 0.6 * k); });
    for (const g of traços) { g.visible = true; g.scale.setScalar(0.01); await durante(0.1, k => g.scale.setScalar(0.01 + 0.99 * k)); }
    // 03 programa: é gerado o ficheiro da peça
    ui.estado(3, "Programa · lateral dir.");
    latParte.mats[0].emissive.setHex(LARANJA);
    await durante(0.6, k => (latParte.mats[0].emissiveIntensity = Math.sin(k * Math.PI) * 0.3));
    ui.ficheiro(latParte.nome);
    await espera(0.9);
    // 04 importação: transição em esbatimento do desenho para a máquina (já com a chapa na mesa)
    ui.estado(4, "Importação");
    const tela = renderer.domElement;
    await durante(0.7, k => (tela.style.opacity = String(1 - suave(k))));
    for (const pt of partes) opacidade(pt, 0);
    arestaMat.opacity = 0;
    peca.visible = sobra.visible = pontes.visible = true;
    maquina.visible = true;
    vista = vistas.importacao;
    Object.assign(cam, { alvo: vista.alvo.clone(), r: vista.r + 4, az: vista.az - 8, pol: vista.pol });
    await durante(0.8, k => (tela.style.opacity = String(suave(k))));
    await espera(0.4);
    // o ficheiro voa para a cabeça da máquina
    const voo = ui.enviarFicheiro(pontoCabeca());
    await durante(voo, k => ui.estado(4, `Importação · ${Math.round(k * 100)}%`));
    // a cabeça confirma: o anel laranja pisca
    await durante(0.6, k => (anel.emissiveIntensity = 0.8 + Math.abs(Math.sin(k * Math.PI * 2)) * 2.2));
    anel.emissiveIntensity = 0.8;
  }

  async function ciclo() {
    await preludio();
    // 01 contorno
    ui.estado(5, "Maquinação · contorno");
    camDestino("maquina");
    const c0 = cantos[0];
    await rapido(new Vector3(c0.x, SEG, c0.z));
    cortando = true;
    await move(new Vector3(c0.x, T * 0.05, c0.z), 1.2);
    await percorrer(cantos.map(p => new Vector3(p.x, T * 0.05, p.z)), 3.4, tpContorno, d => { pontes.count = Math.max(0, NP - Math.floor((d / perimetro) * NP)); });
    pontes.count = 0;
    cortando = false;
    await rapido(new Vector3(c0.x, SEG, c0.z));
    // a sobra é retirada
    sobraMat.transparent = true;
    sobraMat.needsUpdate = true;
    await durante(0.9, k => { sobra.position.y = suave(k) * 0.6; sobraMat.opacity = 1 - k; });
    sobra.visible = false;

    // 02 furação vertical: suportes de prateleira e bases de dobradiça
    ui.estado(5, "Maquinação · furação vertical");
    camDestino("detalhe");
    usar("pequena");
    await Promise.all([recolhe(true), desce(bPequena, true)]);
    for (const h of verticais) {
      await rapido(new Vector3(h.x, T + 0.15, h.z));
      cortando = true;
      await move(new Vector3(h.x, T - h.d, h.z), 1.6);
      cortar(new CylinderGeometry(h.r, h.r, h.d * 2, 16), new Vector3(h.x, T, h.z));
      await move(new Vector3(h.x, T + 0.15, h.z), 3.5);
      cortando = false;
    }
    await desce(bPequena, false);
    await rapido(new Vector3(pos.x, SEG + 0.6, pos.z));

    // 03 furação horizontal: cavilhas nos dois topos da lateral
    ui.estado(5, "Maquinação · furação horizontal");
    camDestino("detalheTopo");
    for (const lado of [1, -1]) {
      usar(lado > 0 ? "menos" : "mais");
      for (const h of topos.filter(t => Math.sign(t.x) === lado)) {
        const fora = h.x + lado * 0.6, junto = h.x + lado * 0.12, fundo = h.x - lado * h.d;
        await rapido(new Vector3(fora, SEG + 0.4, h.z));
        await rapido(new Vector3(fora, T / 2, h.z));
        await move(new Vector3(junto, T / 2, h.z), 3);
        cortando = true;
        await move(new Vector3(fundo, T / 2, h.z), 1.1);
        cortar(new CylinderGeometry(h.r, h.r, h.d * 2, 16), new Vector3(h.x, T / 2, h.z), 0, Math.PI / 2);
        await move(new Vector3(fora, T / 2, h.z), 2.6);
        cortando = false;
      }
      await rapido(new Vector3(pos.x, SEG + 0.4, pos.z));
    }
    usar("fresa");
    await recolhe(false);

    // 04 rasgo (cortado por troços)
    ui.estado(5, "Maquinação · rasgo");
    camDestino("maquina");
    const r0 = new Vector3(-L / 2 - 0.15, T - RD, RZ), r1 = new Vector3(L / 2 + 0.15, T - RD, RZ);
    await rapido(new Vector3(r0.x, SEG, RZ));
    cortando = true;
    await move(r0, 1.5);
    const comp = r1.x - r0.x, TROCOS = 14;
    const baseRasgo = peca;
    let feitos = 0;
    await percorrer([r0, r1], 3.0, tpRasgo, d => {
      const alvoTrocos = Math.min(TROCOS, Math.floor((d / comp) * TROCOS + 1e-6));
      if (alvoTrocos > feitos) {
        feitos = alvoTrocos;
        const b = r0.x + (feitos / TROCOS) * comp;
        cortar(new BoxGeometry(b - r0.x, RD * 2, RW), new Vector3((r0.x + b) / 2, T, RZ), 0, 0, baseRasgo);
      }
    });
    if (peca !== baseRasgo) baseRasgo.geometry.dispose();
    cortando = false;
    await rapido(new Vector3(r1.x, SEG, RZ));

    // concluído
    ui.concluido();
    camDestino("maquina");
    await rapido(CASA);
    await espera(3.5);

    // recomeça: a imagem esbate-se para o fundo e o ciclo volta ao desenho
    const tela = renderer.domElement;
    tela.style.transition = "none";
    await durante(0.9, k => (tela.style.opacity = String(1 - suave(k))));
    reiniciar();
    vista = vistas.desenho;
    Object.assign(cam, { alvo: vista.alvo.clone(), r: vista.r, az: vista.az, pol: vista.pol });
    durante(0.7, k => (tela.style.opacity = String(suave(k))));
    ciclo();
  }

  function reiniciar() {
    novaPeca();
    peca.visible = false;
    pontes.visible = false;
    // móvel de volta ao estado inicial (invisível, montado) e programas por gerar
    for (const g of traços) g.visible = false;
    for (const pt of partes) { opacidade(pt, 0); pt.mats[0].emissiveIntensity = 0; }
    ui.limparFicheiro();
    arestaMat.opacity = 0;
    soArestas = true;
    opCotas(0);
    movel.rotation.y = 0.9;
    maquina.visible = false;
    sobra.visible = false; sobra.position.y = 0; sobraMat.opacity = 1;
    sobraMat.transparent = false; sobraMat.needsUpdate = true;
    pontes.count = NP;
    for (const m of [tpContorno, tpRasgo]) { m.geometry.setDrawRange(0, 0); }
    percursoMat.opacity = 1;
    bPequena.position.y = RET;
    mandril.position.y = 0;
    ativa = "fresa";
    coloca(CASA);
  }

  // estado final (para quem prefere sem movimento)
  function estadoFinal() {
    novaPeca();
    movel.visible = false;
    maquina.visible = true;
    vista = vistas.maquina;
    Object.assign(cam, { alvo: vista.alvo.clone(), r: vista.r, az: vista.az, pol: vista.pol });
    sobra.visible = false; pontes.count = 0;
    for (const h of verticais) cortar(new CylinderGeometry(h.r, h.r, h.d * 2, 16), new Vector3(h.x, T, h.z));
    for (const h of topos) cortar(new CylinderGeometry(h.r, h.r, h.d * 2, 16), new Vector3(h.x, T / 2, h.z), 0, Math.PI / 2);
    cortar(new BoxGeometry(L + 0.4, RD * 2, RW), new Vector3(0, T, RZ));
    for (const m of [tpContorno, tpRasgo]) revela(m, 1);
    coloca(CASA);
    ui.concluido();
  }

  // ---------- câmara, tamanho e ciclo de desenho ----------
  let rato = { x: 0, y: 0 }, ratoSuave = { x: 0, y: 0 };
  host.addEventListener("pointermove", e => {
    const r = host.getBoundingClientRect();
    rato = { x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 };
  });
  host.addEventListener("pointerleave", () => (rato = { x: 0, y: 0 }));

  // Planos de câmara: alvo, distância, azimute e elevação (graus). `segue`: o alvo acompanha a ferramenta.
  type Vista = { alvo: Vector3; r: number; az: number; pol: number; segue?: boolean };
  const vistas: Record<string, Vista> = {
    desenho: { alvo: new Vector3(0.1, 0.45, 0.3), r: 13.5, az: 46, pol: 70 },
    importacao: { alvo: new Vector3(1.2, 0.2, 1.4), r: 28, az: 40, pol: 56 },
    maquina: { alvo: new Vector3(-0.4, 0.9, 0.3), r: 27, az: 58, pol: 58 },
    detalhe: { alvo: new Vector3(), r: 11, az: 50, pol: 54, segue: true },
    detalheTopo: { alvo: new Vector3(), r: 6.5, az: 12, pol: 66, segue: true },
  };
  let vista = vistas.desenho;
  const cam = { alvo: vista.alvo.clone(), r: vista.r, az: vista.az, pol: vista.pol };
  function camDestino(v: keyof typeof vistas) { vista = vistas[v]; }
  const posCamara = (t: number, dt: number) => {
    const k = 1 - Math.exp(-dt * 1.25); // aproximação suave, independente da taxa de fotogramas
    const alvo = vista.segue ? new Vector3(pos.x, Math.max(pos.y, T), pos.z) : vista.alvo;
    cam.alvo.lerp(alvo, k);
    cam.r += (vista.r - cam.r) * k;
    cam.az += (vista.az - cam.az) * k;
    cam.pol += (vista.pol - cam.pol) * k;
    ratoSuave.x += (rato.x - ratoSuave.x) * 0.05;
    ratoSuave.y += (rato.y - ratoSuave.y) * 0.05;
    const az = MathUtils.degToRad(cam.az) + Math.sin(t * 0.12) * 0.1 + ratoSuave.x * 0.3;
    const pol = MathUtils.degToRad(cam.pol) + ratoSuave.y * 0.12;
    const a = cam.alvo, r = cam.r;
    camera.position.set(a.x + r * Math.sin(pol) * Math.sin(az), a.y + r * Math.cos(pol), a.z + r * Math.sin(pol) * Math.cos(az));
    camera.lookAt(a);
  };

  const ajusta = () => {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // em ecrãs estreitos afasta a câmara para a peça caber
    camera.fov = w / h < 1.3 ? 34 : 28;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(() => { ajusta(); if (!animar) desenha(0); }).observe(host);
  ajusta();

  let tempo = 0, ultimo = performance.now(), visivel = true, ativo = false;
  const desenha = (dt: number) => {
    tempo += dt;
    // tarefas (movimentos) em curso
    if (tarefas.length) {
      const atual = tarefas;
      tarefas = [];
      for (const t of atual) {
        t.t += dt;
        const k = Math.min(1, t.t / t.dur);
        t.fn(k);
        if (k >= 1) t.fim(); else tarefas.push(t);
      }
    }
    // broca a rodar, brilho e aparas
    const g = giratoria(ativa);
    if (ativa === "menos" || ativa === "mais") g.rotation.x += dt * 40; else g.rotation.y += dt * 40;
    brilho.visible = cortando;
    if (cortando) {
      brilho.position.copy(pos);
      if (ativa === "menos" || ativa === "mais") brilho.position.x = Math.sign(pos.x) * (L / 2 + 0.02);
      else brilho.position.y = Math.max(pos.y, T) + 0.02;
      brilho.material.opacity = 0.75 + Math.random() * 0.25;
      emitir(brilho.position, 3);
    }
    for (let i = 0; i < NA; i++) {
      if (aparasVida[i] <= 0) continue;
      aparasVida[i] -= dt;
      const j = i * 3;
      aparasVel[j + 1] -= 9 * dt;
      aparasPos[j] += aparasVel[j] * dt; aparasPos[j + 1] += aparasVel[j + 1] * dt; aparasPos[j + 2] += aparasVel[j + 2] * dt;
      if (aparasPos[j + 1] < CHAO + 0.02 || aparasVida[i] <= 0) { aparasPos[j + 1] = -99; aparasVida[i] = 0; }
    }
    aparasGeo.attributes.position.needsUpdate = true;
    for (const pt of partes) {
      const o = pt.mats[0].opacity;
      pt.mesh.visible = o > 0.01 || (soArestas && arestaMat.opacity > 0.01);
      const transp = o < 0.999;
      for (const m of pt.mats) if (m.transparent !== transp) { m.transparent = transp; m.depthWrite = !transp; m.needsUpdate = true; }
    }
    posCamara(tempo, dt);
    renderer.render(scene, camera);
  };
  const loop = (agora: number) => {
    if (!visivel) { ativo = false; return; }
    const dt = Math.min(0.05, (agora - ultimo) / 1000);
    ultimo = agora;
    desenha(dt);
    requestAnimationFrame(loop);
  };
  const arranca = () => { if (!ativo && visivel) { ativo = true; ultimo = performance.now(); requestAnimationFrame(loop); } };

  if (animar) {
    reiniciar();
    new IntersectionObserver(es => { visivel = es.some(e => e.isIntersecting) && !document.hidden; arranca(); }).observe(host);
    document.addEventListener("visibilitychange", () => { visivel = !document.hidden; arranca(); });
    ciclo();
  } else {
    estadoFinal();
    desenha(0);
  }
}

// ponto e direção a uma distância `d` ao longo de uma polilinha
function noPercurso(pts: Vector3[], d: number) {
  for (let i = 1; i < pts.length; i++) {
    const s = pts[i].distanceTo(pts[i - 1]);
    if (d <= s || i === pts.length - 1) {
      const dir = pts[i].clone().sub(pts[i - 1]).normalize();
      return { p: pts[i - 1].clone().addScaledVector(dir, Math.min(d, s)), dir };
    }
    d -= s;
  }
  return { p: pts[0].clone(), dir: new Vector3(1, 0, 0) };
}
