// Sources are fetched directly from KICE and EBSi. Split files exist only in the user's browser.
const mathAnswers = {
  commonEnd: 256.4, selectionTop: 208.4,
  edges: [256.4, 339.3, 422.1, 505.6],
};
const koreanAnswers = {
  commonEnd: 297.9, selectionTop: 205.4,
  edges: [297.9, 404.7, 503.2],
};

const tracks = {
  // Ranges are 1-based pages in the published, odd-form question paper.
  'math-probability': { paper: [[1, 12]], answer: mathAnswers, column: 0, solution: [[1, 17]] },
  'math-calculus': {
    paper: [[1, 8], [13, 16]], answer: mathAnswers, column: 1,
    solution: [[1, 12], [13, 13, { right: 299 }], [18, 24], [25, 25, { right: 299 }]],
  },
  'math-geometry': {
    paper: [[1, 8], [17, 20]], answer: mathAnswers, column: 2,
    solution: [[1, 12], [13, 13, { right: 299 }], [25, 25, { left: 299 }], [26, 32]],
  },
  'korean-writing': {
    paper: [[1, 16]], answer: koreanAnswers, column: 0,
    solution: [[1, 26], [27, 27, { below: 178 }]],
  },
  'korean-media': {
    paper: [[1, 12], [17, 20]], answer: koreanAnswers, column: 1,
    solution: [[1, 21], [27, 27, { above: 199 }], [28, 33]],
  },
};

const libraries = new Map();
function loadScript(file) {
  if (!libraries.has(file)) {
    libraries.set(file, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL(file, import.meta.url);
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    }).catch(error => {
      libraries.delete(file);
      throw error;
    }));
  }
  return libraries.get(file);
}

async function addRegion(output, target, page, region, x = region.left ?? 0) {
  const { width, height } = page.getSize();
  const box = {
    left: region.left ?? 0,
    right: region.right ?? width,
    top: height - (region.above ?? 0),
    bottom: height - (region.below ?? height),
  };
  const image = await output.embedPage(page, box);
  target.drawPage(image, { x, y: box.bottom });
}

async function splitPdf(bytes, trackName, kind) {
  await loadScript('vendor/pdf-lib-1.17.1.min.js');
  const { PDFDocument } = window.PDFLib;
  const source = await PDFDocument.load(bytes);
  const output = await PDFDocument.create();
  const track = tracks[trackName];
  const expectedPages = kind === 'paper' ? 40 : kind === 'answer' ? 2 :
    trackName.startsWith('math-') ? 32 : 33;
  if (!track || source.getPageCount() !== expectedPages) {
    throw new Error('Unexpected source PDF layout');
  }

  if (kind === 'answer') {
    const { commonEnd, selectionTop, edges } = track.answer;
    const original = source.getPage(0);
    const target = output.addPage([original.getWidth(), original.getHeight()]);
    const titleBottom = 177;
    await addRegion(output, target, original, { below: titleBottom });
    await addRegion(output, target, original, { right: commonEnd, above: titleBottom });
    await addRegion(output, target, original, {
      left: edges[track.column], right: edges[track.column + 1], above: selectionTop,
    }, commonEnd - 0.4);
  } else {
    const selections = track[kind].flatMap(([first, last, region]) =>
      Array.from({ length: last - first + 1 }, (_, index) => ({ index: first - 1 + index, region })));
    const wholePages = await output.copyPages(source, selections.filter(page => !page.region).map(page => page.index));
    let nextWholePage = 0;
    for (const { index, region } of selections) {
      if (!region) {
        output.addPage(wholePages[nextWholePage++]);
      } else {
        const original = source.getPage(index);
        const target = output.addPage([original.getWidth(), original.getHeight()]);
        await addRegion(output, target, original, region);
      }
    }
  }

  output.setTitle(source.getTitle() || '2027학년도 대학수학능력시험');
  return output.save();
}

async function unzipMember(bytes, matches) {
  await loadScript('vendor/fflate-0.8.2.min.js');
  const entries = Object.values(window.fflate.unzipSync(new Uint8Array(bytes), {
    filter: entry => matches(entry.name),
  }));
  if (entries.length !== 1) throw new Error('Unexpected ZIP entries');
  return entries[0];
}

async function fetchSource(url) {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) throw new Error(`Source returned ${response.status}`);
  return response.arrayBuffer();
}

function saveFile(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], {
    type: name.endsWith('.mp3') ? 'audio/mpeg' : 'application/pdf',
  }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function showDownloadError(url) {
  let status = document.getElementById('csat-download-status');
  if (!status) {
    status = document.createElement('p');
    status.id = 'csat-download-status';
    status.setAttribute('role', 'status');
    status.style.textAlign = 'center';
    document.body.append(status);
  }
  const source = document.createElement('a');
  source.href = url;
  source.target = '_blank';
  source.rel = 'noopener';
  source.textContent = '원본 열기';
  status.replaceChildren('파일을 준비하지 못했어요. ', source);
}

const player = document.querySelector('audio[data-listening-zip]');
let listeningAudio;
function getListeningAudio(url) {
  listeningAudio ??= fetchSource(url)
    .then(bytes => unzipMember(bytes, name => name.toLowerCase().endsWith('.mp3')))
    .catch(error => { listeningAudio = undefined; throw error; });
  return listeningAudio;
}

for (const link of document.querySelectorAll('a[data-filename]')) {
  link.addEventListener('click', async event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    if (link.getAttribute('aria-busy') === 'true') return;

    const { filename, zipMember, zipExtension, pdfTrack, pdfKind } = link.dataset;
    const originalLabel = link.textContent;
    const url = link.href;
    link.setAttribute('aria-busy', 'true');
    link.textContent = '준비 중…';
    document.getElementById('csat-download-status')?.remove();
    try {
      let bytes = zipExtension ? await getListeningAudio(url) : await fetchSource(url);
      if (zipMember) bytes = await unzipMember(bytes, name => name === zipMember);
      if (pdfTrack) bytes = await splitPdf(bytes, pdfTrack, pdfKind);
      saveFile(bytes, filename);
    } catch {
      showDownloadError(url);
    } finally {
      link.removeAttribute('aria-busy');
      link.textContent = originalLabel;
    }
  });
}

if (player) {
  player.loadListening = async () => {
    if (player.hasAttribute('src')) return;
    const bytes = await getListeningAudio(player.dataset.listeningZip);
    player.src = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
  };
  window.addEventListener('pagehide', event => {
    if (!event.persisted && player.src.startsWith('blob:')) URL.revokeObjectURL(player.src);
  });
}
