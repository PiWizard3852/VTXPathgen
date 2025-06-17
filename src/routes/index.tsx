import {
  component$,
  useSignal,
  useStore,
  useVisibleTask$,
} from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';

import { getName } from '@tauri-apps/api/app';
import {
  BaseDirectory,
  exists,
  writeFile,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import Logo from '~/logo.svg?jsx';

import { parseCode } from '~/components/parse';

export interface Curve {
  color: string;
  points: Point[];
}

export interface Point {
  x: number;
  y: number;
}

async function isTauri() {
  try {
    await getName();
    return true;
  } catch {
    return false;
  }
}

function toCanvasCoords(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: ((x + 72) / 144) * width,
    y: height - ((y + 72) / 144) * height,
  };
}

function fromCanvasCoords(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: (x / width) * 144 - 72,
    y: ((height - y) / height) * 144 - 72,
  };
}

function catmullRom(
  t: number,
  P0: Point,
  P1: Point,
  P2: Point,
  P3: Point,
): Point {
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x:
      0.5 *
      (2 * P1.x +
        (-P0.x + P2.x) * t +
        (2 * P0.x - 5 * P1.x + 4 * P2.x - P3.x) * t2 +
        (-P0.x + 3 * P1.x - 3 * P2.x + P3.x) * t3),
    y:
      0.5 *
      (2 * P1.y +
        (-P0.y + P2.y) * t +
        (2 * P0.y - 5 * P1.y + 4 * P2.y - P3.y) * t2 +
        (-P0.y + 3 * P1.y - 3 * P2.y + P3.y) * t3),
  };
}

function addPoint(curve: Curve) {
  const oldPoints = [...curve.points];
  const n = oldPoints.length;

  if (n < 2) return;

  const targetCount = n + 1;
  const controlPoints = [oldPoints[0], ...oldPoints, oldPoints[n - 1]];
  const segments = controlPoints.length - 3;

  const newPoints: Point[] = [];

  for (let i = 0; i < targetCount; i++) {
    const globalT = i / (targetCount - 1);
    const segmentIndex = Math.min(Math.floor(globalT * segments), segments - 1);
    const localT = globalT * segments - segmentIndex;

    const p = catmullRom(
      localT,
      controlPoints[segmentIndex],
      controlPoints[segmentIndex + 1],
      controlPoints[segmentIndex + 2],
      controlPoints[segmentIndex + 3],
    );

    newPoints.push({
      x: Math.floor(p.x * 100) / 100,
      y: Math.floor(p.y * 100) / 100,
    });
  }

  curve.points.length = 0;
  curve.points.push(...newPoints);
}

function removePoint(curve: Curve, removeIndex: number) {
  if (curve.points.length <= 2) return;

  const filteredPoints = curve.points.filter((_, i) => i !== removeIndex);
  const n = filteredPoints.length;

  const controlPoints = [
    filteredPoints[0],
    ...filteredPoints,
    filteredPoints[n - 1],
  ];
  const segments = controlPoints.length - 3;

  const newPoints: Point[] = [];

  for (let i = 0; i < n; i++) {
    const globalT = i / (n - 1);
    const segmentIndex = Math.min(Math.floor(globalT * segments), segments - 1);
    const localT = globalT * segments - segmentIndex;

    const p = catmullRom(
      localT,
      controlPoints[segmentIndex],
      controlPoints[segmentIndex + 1],
      controlPoints[segmentIndex + 2],
      controlPoints[segmentIndex + 3],
    );

    newPoints.push({
      x: Math.floor(p.x * 100) / 100,
      y: Math.floor(p.y * 100) / 100,
    });
  }

  curve.points = newPoints;
}

function codeGen(curve: Curve) {
  let result =
    'new FollowTrajectories(<br/>&nbsp;START_HEADING,<br/>&nbsp;END_HEADING';

  for (let i = 0; i < curve.points.length; i++) {
    result += `,<br/>&nbsp;new Point(${curve.points[i].x}, ${curve.points[i].y})`;
  }

  result += '<br/>)';

  return result;
}

export default component$(() => {
  const canvasRef = useSignal<HTMLCanvasElement>();
  const curves = useStore<Curve[]>([]);

  const importing = useSignal(false);
  const importCode = useSignal('');

  const desktop = useSignal(false);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    track(() => curves.length);

    desktop.value = await isTauri();

    const canvas = canvasRef.value!;

    const context = canvas.getContext('2d')!;
    const background = new Image();

    background.src = 'background.png';

    const resize = () => {
      const w =
        window.innerWidth > 1100
          ? Math.min(window.innerWidth - 400, window.innerHeight - 40)
          : window.innerWidth - 40;
      canvas.width = w;
      canvas.height = w;
    };

    resize();

    window.addEventListener('resize', resize);

    background.onload = () => {
      const draw = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(background, 0, 0, canvas.width, canvas.height);

        for (const curve of curves) {
          if (curve.points.length >= 2) {
            const pts = curve.points;

            const controlPoints = [pts[0], ...pts, pts[pts.length - 1]];

            context.strokeStyle = curve.color;
            context.lineWidth = 4;

            context.beginPath();

            for (let i = 0; i < controlPoints.length - 3; i++) {
              for (let t = 0; t <= 1; t += 0.01) {
                const p = catmullRom(
                  t,
                  controlPoints[i],
                  controlPoints[i + 1],
                  controlPoints[i + 2],
                  controlPoints[i + 3],
                );

                const { x, y } = toCanvasCoords(
                  p.x,
                  p.y,
                  canvas.width,
                  canvas.height,
                );

                if (i === 0 && t === 0) {
                  context.moveTo(x, y);
                } else {
                  context.lineTo(x, y);
                }
              }
            }

            context.stroke();
          }
        }

        for (const curve of curves) {
          context.fillStyle = curve.color;

          for (const point of curve.points) {
            const { x, y } = toCanvasCoords(
              point.x,
              point.y,
              canvas.width,
              canvas.height,
            );

            context.beginPath();
            context.arc(x, y, 8, 0, 2 * Math.PI);
            context.fill();
          }
        }

        requestAnimationFrame(draw);
      };

      requestAnimationFrame(draw);
    };

    let dragging = null as null | { curveIndex: number; pointIndex: number };

    canvasRef.value!.addEventListener('mousedown', (e) => {
      const rect = canvasRef.value!.getBoundingClientRect();

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const width = canvasRef.value!.width;
      const height = canvasRef.value!.height;

      curves.forEach((curve, ci) => {
        curve.points.forEach((p, pi) => {
          const { x: px, y: py } = toCanvasCoords(p.x, p.y, width, height);

          if (Math.hypot(x - px, y - py) < 10) {
            dragging = { curveIndex: ci, pointIndex: pi };
          }
        });
      });
    });

    canvasRef.value!.addEventListener('mousemove', (e) => {
      if (dragging) {
        if (dragging.pointIndex === 0 && dragging.curveIndex !== 0) {
          dragging.curveIndex--;
          dragging.pointIndex = curves[dragging.curveIndex].points.length - 1;
        }

        const rect = canvasRef.value!.getBoundingClientRect();

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const width = canvasRef.value!.width;
        const height = canvasRef.value!.height;

        const { x: nx, y: ny } = fromCanvasCoords(x, y, width, height);

        curves[dragging.curveIndex].points[dragging.pointIndex].x =
          Math.floor(nx * 100) / 100;

        curves[dragging.curveIndex].points[dragging.pointIndex].y =
          Math.floor(ny * 100) / 100;

        if (
          dragging.pointIndex ===
            curves[dragging.curveIndex].points.length - 1 &&
          dragging.curveIndex < curves.length - 1
        ) {
          curves[dragging.curveIndex + 1].points[0].x =
            curves[dragging.curveIndex].points[dragging.pointIndex].x;
          curves[dragging.curveIndex + 1].points[0].y =
            curves[dragging.curveIndex].points[dragging.pointIndex].y;
        }
      }
    });

    canvasRef.value!.addEventListener('mouseup', () => (dragging = null));
    canvasRef.value!.addEventListener('mouseleave', () => (dragging = null));
  });

  return (
    <main class='w-screen p-[20px] sm:flex sm:h-screen sm:gap-[20px]'>
      <section class='flex h-full items-center'>
        <canvas
          ref={canvasRef}
          class='border-border my-auto rounded-[4px] border border-solid'
        />
      </section>
      <section class='sm:no-scrollbar mt-[20px] flex w-full flex-col gap-[12px] sm:mt-0 sm:w-[calc(100vw-min(100vw-400px,100vh-40px))] sm:overflow-scroll'>
        <article class='border-border flex w-full justify-between rounded-[4px] border border-solid bg-black p-[16px] sm:sticky sm:top-0'>
          <Logo class='h-[40px] w-[40px]' />
          <div class='flex gap-[28px]'>
            <button
              class='hover:text-branding cursor-pointer duration-200'
              onClick$={() => {
                curves.push({
                  color:
                    '#' +
                    [...Array(6)]
                      .map(() => Math.floor(Math.random() * 16).toString(16))
                      .join(''),
                  points: [
                    {
                      x:
                        curves.length > 0
                          ? curves[curves.length - 1].points[
                              curves[curves.length - 1].points.length - 1
                            ].x
                          : Math.floor((Math.random() * 144 - 72) * 100) / 100,
                      y:
                        curves.length > 0
                          ? curves[curves.length - 1].points[
                              curves[curves.length - 1].points.length - 1
                            ].y
                          : Math.floor((Math.random() * 144 - 72) * 100) / 100,
                    },
                    {
                      x: Math.floor((Math.random() * 144 - 72) * 100) / 100,
                      y: Math.floor((Math.random() * 144 - 72) * 100) / 100,
                    },
                  ],
                });
              }}
            >
              <svg
                xmlns='http://www.w3.org/2000/svg'
                fill='none'
                viewBox='0 0 24 24'
                stroke-width='1.5'
                stroke='currentColor'
                class='size-6'
              >
                <path
                  stroke-linecap='round'
                  stroke-linejoin='round'
                  d='M12 4.5v15m7.5-7.5h-15'
                />
              </svg>
            </button>
            <button
              onClick$={() => {
                importing.value = true;
              }}
              class='hover:text-branding cursor-pointer duration-200'
            >
              <svg
                xmlns='http://www.w3.org/2000/svg'
                fill='none'
                viewBox='0 0 24 24'
                stroke-width='1.5'
                stroke='currentColor'
                class='size-6'
              >
                <path
                  stroke-linecap='round'
                  stroke-linejoin='round'
                  d='M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5'
                />
              </svg>
            </button>
            <button
              onClick$={async () => {
                const canvas = canvasRef.value;

                const pngDataUrl = canvas!.toDataURL('image/png');

                let txt = '';

                for (let i = 0; i < curves.length; i++) {
                  txt += (i !== 0 ? ',\n' : '') + codeGen(curves[i]);
                }

                txt = txt.replaceAll('<br/>', '\n').replaceAll('&nbsp;', '\t');

                if (desktop.value) {
                  const pngBase64 = pngDataUrl.split(',')[1];
                  const pngBytes = Uint8Array.from(atob(pngBase64), (c) =>
                    c.charCodeAt(0),
                  );

                  let pngPathname = 'vtx-pathgen.png';
                  let pngPathnameIndex = 1;

                  while (
                    await exists(pngPathname, {
                      baseDir: BaseDirectory.Download,
                    })
                  ) {
                    pngPathname = `vtx-pathgen(${pngPathnameIndex++}).png`;
                  }

                  await writeFile(pngPathname, pngBytes, {
                    baseDir: BaseDirectory.Download,
                  });

                  let txtPathname = 'vtx-pathgen.txt';
                  let txtPathnameIndex = 1;

                  while (
                    await exists(txtPathname, {
                      baseDir: BaseDirectory.Download,
                    })
                  ) {
                    txtPathname = `vtx-pathgen(${txtPathnameIndex++}).txt`;
                  }

                  await writeTextFile(txtPathname, txt, {
                    baseDir: BaseDirectory.Download,
                  });
                } else {
                  const pngA = document.createElement('a');

                  pngA.href = pngDataUrl;
                  pngA.download = 'vtx-pathgen.png';

                  pngA.click();

                  const blob = new Blob([txt], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);

                  const txtA = document.createElement('a');

                  txtA.href = url;
                  txtA.download = 'vtx-pathgen.txt';

                  txtA.click();
                }
              }}
              class='hover:text-branding cursor-pointer duration-200'
            >
              <svg
                xmlns='http://www.w3.org/2000/svg'
                fill='none'
                viewBox='0 0 24 24'
                stroke-width='1.5'
                stroke='currentColor'
                class='size-6'
              >
                <path
                  stroke-linecap='round'
                  stroke-linejoin='round'
                  d='M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3'
                />
              </svg>
            </button>
          </div>
        </article>
        {curves.map((curve, ci) => {
          // eslint-disable-next-line qwik/use-method-usage
          const copySuccessful = useSignal(false);

          return (
            <article
              key={ci}
              class='border-border w-full rounded-[4px] border border-solid p-[16px]'
            >
              <header class='flex items-center justify-between text-[18px]'>
                <h2>#{ci + 1}</h2>
                <div class='flex items-center gap-[12px]'>
                  <button
                    class='cursor-pointer text-green-600 duration-200 hover:text-green-500'
                    onClick$={() => {
                      addPoint(curve);
                    }}
                  >
                    <svg
                      xmlns='http://www.w3.org/2000/svg'
                      fill='none'
                      viewBox='0 0 24 24'
                      stroke-width='1.5'
                      stroke='currentColor'
                      class='size-6'
                    >
                      <path
                        stroke-linecap='round'
                        stroke-linejoin='round'
                        d='M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'
                      />
                    </svg>
                  </button>
                  <button
                    class='cursor-pointer text-red-800 duration-200 hover:text-red-700'
                    onClick$={() => {
                      curves.splice(ci, 1);
                    }}
                  >
                    <svg
                      xmlns='http://www.w3.org/2000/svg'
                      fill='none'
                      viewBox='0 0 24 24'
                      stroke-width='1.5'
                      stroke='currentColor'
                      class='size-6'
                    >
                      <path
                        stroke-linecap='round'
                        stroke-linejoin='round'
                        d='M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'
                      />
                    </svg>
                  </button>
                </div>
              </header>
              <div
                class='my-[8px] h-[2px]'
                style={{ backgroundColor: curve.color }}
              />
              <section class='flex flex-col gap-[24px] pl-[24px]'>
                {curve.points.map((point, pi) => (
                  <div
                    key={pi}
                    class='flex items-center justify-between'
                  >
                    <div class='flex items-center gap-[16px]'>
                      X:{' '}
                      <input
                        class='border-border w-[100px] rounded-[4px] border border-solid p-[4px] text-[14px] outline-none'
                        type='number'
                        value={point.x}
                        onInput$={(e) => {
                          point.x =
                            Math.floor(
                              parseFloat((e.target as HTMLInputElement).value) *
                                100,
                            ) / 100;

                          if (
                            pi === curve.points.length - 1 &&
                            ci < curves.length - 1
                          ) {
                            curves[ci + 1].points[0].x = point.x;
                          }

                          if (pi === 0 && ci > 0) {
                            curves[ci - 1].points[
                              curves[ci - 1].points.length - 1
                            ].x = point.x;
                          }
                        }}
                      />
                      Y:{' '}
                      <input
                        class='border-border w-[100px] rounded-[4px] border border-solid p-[4px] text-[14px] outline-none'
                        type='number'
                        value={point.y}
                        onInput$={(e) => {
                          point.y =
                            Math.floor(
                              parseFloat((e.target as HTMLInputElement).value) *
                                100,
                            ) / 100;

                          if (
                            pi === curve.points.length - 1 &&
                            ci < curves.length - 1
                          ) {
                            curves[ci + 1].points[0].y = point.y;
                          }

                          if (pi === 0 && ci > 0) {
                            curves[ci - 1].points[
                              curves[ci - 1].points.length - 1
                            ].y = point.y;
                          }
                        }}
                      />
                    </div>
                    <button
                      disabled={curve.points.length === 2}
                      class='mr-[16px] cursor-pointer text-red-800 duration-200 hover:text-red-700 disabled:cursor-not-allowed'
                      onClick$={() => {
                        removePoint(curve, pi);
                      }}
                    >
                      <svg
                        xmlns='http://www.w3.org/2000/svg'
                        fill='none'
                        viewBox='0 0 24 24'
                        stroke-width='1.5'
                        stroke='currentColor'
                        class='size-5'
                      >
                        <path
                          stroke-linecap='round'
                          stroke-linejoin='round'
                          d='M5 12h14'
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </section>
              <div class='relative mt-[16px] rounded-[4px] bg-slate-600 p-[12px] text-[14px] leading-[1.15] text-slate-300 select-none'>
                <button
                  class={`absolute top-0 right-0 m-[8px] flex cursor-pointer gap-[8px] overflow-hidden transition-all duration-200 hover:text-slate-200 ${copySuccessful.value ? 'w-[80px] bg-slate-600' : 'w-[20px]'}`}
                  onClick$={() => {
                    navigator.clipboard
                      .writeText(
                        codeGen(curve)
                          .replaceAll('<br/>', '\n')
                          .replaceAll('&nbsp;', '\t'),
                      )
                      .then(() => {
                        copySuccessful.value = true;

                        setTimeout(() => {
                          copySuccessful.value = false;
                        }, 1000);
                      });
                  }}
                >
                  <svg
                    xmlns='http://www.w3.org/2000/svg'
                    fill='none'
                    viewBox='0 0 24 24'
                    stroke-width='1.5'
                    stroke='currentColor'
                    class='size-5'
                  >
                    <path
                      stroke-linecap='round'
                      stroke-linejoin='round'
                      d='M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5A3.375 3.375 0 0 0 6.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0 0 15 2.25h-1.5a2.251 2.251 0 0 0-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 0 0-9-9Z'
                    />
                  </svg>
                  <span
                    class={`transition-all duration-300 ${copySuccessful.value ? 'inline opacity-100' : 'hidden opacity-0'}`}
                  >
                    Copied!
                  </span>
                </button>
                <div dangerouslySetInnerHTML={codeGen(curve)} />
              </div>
            </article>
          );
        })}
        {importing.value && (
          <article class='border-border w-full rounded-[4px] border border-solid p-[16px]'>
            <header class='flex items-center justify-between'>
              <button
                class='cursor-pointer text-red-800 duration-200 hover:text-red-700'
                onClick$={() => {
                  importing.value = false;
                }}
              >
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke-width='1.5'
                  stroke='currentColor'
                  class='size-6'
                >
                  <path
                    stroke-linecap='round'
                    stroke-linejoin='round'
                    d='m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'
                  />
                </svg>
              </button>
              <button
                disabled={importCode.value.trim() === ''}
                class='cursor-pointer text-slate-300 duration-200 hover:text-slate-200 disabled:cursor-not-allowed'
                onClick$={() => {
                  parseCode(importCode.value.trim())?.forEach((curve) => {
                    curves.push(curve);
                  });

                  importing.value = false;
                  importCode.value = '';
                }}
              >
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke-width='1.5'
                  stroke='currentColor'
                  class='size-6'
                >
                  <path
                    stroke-linecap='round'
                    stroke-linejoin='round'
                    d='m12.75 15 3-3m0 0-3-3m3 3h-7.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'
                  />
                </svg>
              </button>
            </header>
            <textarea
              onInput$={(e) => {
                importCode.value = (e.target as HTMLInputElement).value;
              }}
              class='border-border mt-[12px] h-[150px] w-full resize-none rounded-[4px] border border-solid p-[8px] outline-none'
            />
          </article>
        )}
      </section>
    </main>
  );
});

export const head: DocumentHead = {
  title: 'VTXPathgen',
  meta: [
    {
      name: 'description',
      content:
        'Catmull Rom spline visualization and codegen for FTC team 15534 VERTEX',
    },
  ],
};
