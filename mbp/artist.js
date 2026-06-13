// Evolutionary SVG Artist

// ── Moods ─────────────────────────────────

const MOODS = [
  // positive
  'euphoric', 'hopeful', 'tender', 'grateful', 'serene',
  'defiant', 'curious', 'reverent', 'exhilarated', 'determined',
  // negative
  'despairing', 'grief-stricken', 'furious', 'alienated', 'terrified',
  'ashamed', 'bitter', 'numb', 'mournful', 'disoriented',
];

const FORBIDDEN_WORDS = [
  'explore', 'evoke', 'journey',
  'fracture', 'fractured', 'fracturing',
  'shattered', 'shattering',
  'system',
];

// ── Parsing ──────────────────────────────

function extractBlock(text, fence) {
  const re = new RegExp('```' + fence + '\\s*([\\s\\S]*?)```', 'i');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function extractSVG(text) {
  let svg = extractBlock(text, 'svg');
  if (!svg) {
    const m = text.match(/<svg[\s\S]*?<\/svg>/i);
    svg = m ? m[0] : null;
  }
  return svg ? sanitizeSVG(svg) : null;
}

function extractStatement(text) {
  return extractBlock(text, 'statement') || extractBlock(text, 'artist') || null;
}

function renderStatement(text) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/\*([^*]+)\*/g, '<b>$1</b>');
}

function extractMovementName(text) {
  const m = text.match(/^MOVEMENT:\s*(.+)$/mi);
  return m ? m[1].replace(/\*/g, '').trim() : 'Unnamed Movement';
}

function extractMovementPhilosophy(text) {
  const m = text.match(/^PHILOSOPHY:\s*([\s\S]+?)(?:\n[A-Z]+:|$)/mi);
  return m ? m[1].trim() : '';
}

function reorderBackground(svgStr) {
  try {
    const doc   = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return svgStr;

    for (const child of Array.from(svgEl.children)) {
      if (child.tagName !== 'rect') continue;
      const x = parseFloat(child.getAttribute('x') || '0');
      const y = parseFloat(child.getAttribute('y') || '0');
      const w = child.getAttribute('width')  || '';
      const h = child.getAttribute('height') || '';
      const isBg = x <= 0 && y <= 0
        && (w === '100%' || parseFloat(w) >= 380)
        && (h === '100%' || parseFloat(h) >= 380);
      if (isBg) {
        svgEl.insertBefore(child, svgEl.firstChild);
        break;
      }
    }

    return new XMLSerializer().serializeToString(svgEl);
  } catch (e) {
    return svgStr;
  }
}

function sanitizeSVG(svg) {
  const scriptsBefore = (svg.match(/<script/gi) || []).length;
  const handlersBefore = (svg.match(/\son\w+=/gi) || []).length;
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, '');
  svg = svg.replace(/\s+on\w+="[^"]*"/gi, '');
  svg = svg.replace(/\s+on\w+='[^']*'/gi, '');
  svg = svg.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, '');
  svg = svg.replace(/xlink:href\s*=\s*["']javascript:[^"']*["']/gi, '');
  if (scriptsBefore > 0 || handlersBefore > 0) {
    console.warn(`[sanitize] stripped ${scriptsBefore} <script> blocks and ${handlersBefore} event handlers from SVG`);
  }
  const m = svg.match(/<svg[\s\S]*<\/svg>/i);
  return m ? reorderBackground(m[0]) : null;
}

// ── Main class ───────────────────────────

class ArtEvolution {
  constructor() {
    this.gallery     = document.getElementById('gallery');
    this.tooltip     = document.getElementById('tooltip');
    this.pillMove    = document.getElementById('pillMovement');
    this.pillPiece   = document.getElementById('pillPiece');
    this.pillGen     = document.getElementById('pillGen');
    this.lightboxIndex = -1;
    this.statusMsg   = document.getElementById('statusMsg');
    this.pauseBtn    = document.getElementById('pauseBtn');

    this.movementIndex      = 0;
    this.movementName       = '';
    this.movementPhilosophy = '';
    this.pieceInMovement    = 0;
    this.totalGeneration    = 0;

    this.lastSVG       = null;
    this.lastStatement = null;
    this.pieces        = [];

    this.movementMood     = null;
    this.prevMovementMood = null;

    this.running   = false;
    this.paused    = false;
    this._resumeCb = null;

    this.stylePool = [
      'Renaissance', 'Baroque', 'Rococo', 'Neoclassicism', 'Romanticism',
      'Realism', 'Impressionism', 'Post-Impressionism', 'Symbolism', 'Art Nouveau',
      'Expressionism', 'Fauvism', 'Cubism', 'Futurism', 'Dadaism',
      'Constructivism', 'De Stijl', 'Bauhaus', 'Surrealism', 'Abstract Expressionism',
      'Color Field', 'Minimalism', 'Pop Art', 'Conceptual Art', 'Photorealism',
      'Neo-Expressionism', 'Postmodernism', 'Street Art', 'Suprematism', 'Outsider Art',
    ];

    this._bindEvents();
    console.log('[ArtEvolution] instance created');
  }

  _bindEvents() {
    this.pauseBtn.addEventListener('click', () => {
      this.paused ? this._resume() : this._pause();
    });

    document.addEventListener('mousemove', e => {
      if (!this.tooltip.classList.contains('visible')) return;
      const x = Math.min(e.clientX + 16, window.innerWidth  - 310);
      const y = Math.min(e.clientY - 10, window.innerHeight - 170);
      this.tooltip.style.left = Math.max(8, x) + 'px';
      this.tooltip.style.top  = Math.max(8, y) + 'px';
    });

    document.getElementById('clearBtn').addEventListener('click', () => this._clearSavedState());
    document.getElementById('lbClose').addEventListener('click', () => this._closeLightbox());
    document.getElementById('lbBackdrop').addEventListener('click', () => this._closeLightbox());
    document.getElementById('lbPrev').addEventListener('click', () => this._navigateLightbox(-1));
    document.getElementById('lbNext').addEventListener('click', () => this._navigateLightbox(1));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape')     this._closeLightbox();
      if (e.key === 'ArrowLeft')  this._navigateLightbox(-1);
      if (e.key === 'ArrowRight') this._navigateLightbox(1);
    });
  }

  _boot(msg) {
    this._status(msg);
    const el = document.getElementById('bootLabel');
    if (el) el.textContent = msg;
  }

  _hideBoot() {
    const el = document.getElementById('bootMsg');
    if (el) el.classList.add('hidden');
  }

  async start() {
    console.group('[start] initializing');

    if (!('LanguageModel' in window)) {
      console.error('[start] LanguageModel API not found — requires Chrome 138+ with Gemini Nano enabled');
      this._boot('LanguageModel API not available — requires Chrome 138+ with Gemini Nano.');
      console.groupEnd();
      return;
    }

    this._boot('Checking AI availability…');
    console.log('[start] LanguageModel API present, checking availability...');
    try {
      const avail = await LanguageModel.availability();
      console.log(`[start] model availability: "${avail}"`);
      if (avail === 'unavailable') {
        console.error('[start] model is unavailable on this device');
        this._boot('LLM model unavailable on this device.');
        console.groupEnd();
        return;
      }
    } catch (e) {
      console.error('[start] availability check threw:', e);
      this._boot(`LLM check failed: ${e.message}`);
      console.groupEnd();
      return;
    }

    this.running = true;
    this.pauseBtn.disabled = false;
    console.groupEnd();

    const restored = this._restoreState();
    if (restored) {
      this._boot(`Restored ${this.pieces.length} pieces — continuing…`);
    } else {
      this._boot('Generating first movement…');
    }
    this._loop();
  }

  async _loop() {
    console.log('[loop] starting main loop');

    while (this.running) {
      if (this.paused) {
        console.log('[loop] paused — awaiting resume');
        await new Promise(r => { this._resumeCb = r; });
        console.log('[loop] resumed');
      }

      // First piece always starts a movement; afterwards 1-in-5 chance of a new one
      const roll = Math.random();
      const startNewMovement = this.movementIndex === 0 || roll < 0.2;
      console.groupCollapsed(
        `[loop] gen ${this.totalGeneration + 1} — movement #${this.movementIndex}` +
        (this.movementIndex === 0
          ? ' (first, always starts new movement)'
          : ` | roll ${roll.toFixed(3)} → ${startNewMovement ? 'NEW MOVEMENT' : `continuing "${this.movementName}" (piece ${this.pieceInMovement + 1})`}`)
      );

      if (startNewMovement) {
        this.pieceInMovement = 0;
        this._status(this.movementIndex === 0 ? 'Finding an artistic voice...' : 'Entering a new movement...');
        try {
          await this._generateMovement();
        } catch (e) {
          console.error('[loop] movement generation failed:', e);
          this._status(`Movement generation failed: ${e.message}. Retrying...`);
          console.groupEnd();
          await this._delay(3000);
          continue;
        }
      }

      this.pillPiece.textContent = this.pieceInMovement + 1;
      this._status(`${this.movementName} — composing piece ${this.pieceInMovement + 1}...`);
      console.log(`[loop] starting piece ${this.pieceInMovement + 1} of movement "${this.movementName}"`);
      const cell = this._addPlaceholder();

      try {
        await this._generateArtwork(cell);
      } catch (e) {
        console.error(`[loop] artwork generation failed for piece ${this.pieceInMovement + 1}:`, e);
        this._failCell(cell, e.message);
        this._status(`Piece failed: ${e.message}`);
        console.groupEnd();
        await this._delay(2000);
        continue;
      }

      this.pieceInMovement++;
      this.totalGeneration++;
      this.pillGen.textContent = this.totalGeneration;
      this._saveState();
      console.log(`[loop] piece complete — total generations: ${this.totalGeneration}`);
      console.groupEnd();
    }

    console.log('[loop] loop exited (running = false)');
  }

  // ── LLM calls ────────────────────────


  async _generateMovement() {
    const prevMovement = this.movementName;

    // Carry forward previous mood for re-evaluation framing
    this.prevMovementMood = this.movementMood;

    // Pick new mood randomly
    this.movementMood = MOODS[Math.floor(Math.random() * MOODS.length)];

    // Pick 2 distinct styles at random
    const i = Math.floor(Math.random() * this.stylePool.length);
    let j = Math.floor(Math.random() * (this.stylePool.length - 1));
    if (j >= i) j++;
    const styleA = this.stylePool[i];
    const styleB = this.stylePool[j];

    console.group(`[movement] generating movement #${this.movementIndex + 1}`);
    console.log(`[movement] fusing: "${styleA}" (index ${i}) + "${styleB}" (index ${j})`);
    if (prevMovement) console.log(`[movement] previous movement was: "${prevMovement}"`);

    const prompt = this._movementPrompt(prevMovement, styleA, styleB);
    console.log('[movement] prompt:\n', prompt);

    const response = await this._callLLM(prompt, 'movement');
    console.log('[movement] raw response:\n', response);

    this.movementIndex++;
    this.movementName       = extractMovementName(response);
    this.movementPhilosophy = extractMovementPhilosophy(response);

    console.log(`[movement] parsed name: "${this.movementName}"`);
    console.log(`[movement] parsed philosophy: "${this.movementPhilosophy}"`);
    if (this.movementName === 'Unnamed Movement') {
      console.warn('[movement] name extraction failed — no MOVEMENT: line found in response');
    }
    if (!this.movementPhilosophy) {
      console.warn('[movement] philosophy extraction failed — no PHILOSOPHY: line found in response');
    }

    this.pillMove.textContent  = this.movementName;
    this.pillPiece.textContent = '—';
    console.groupEnd();
  }

  async _generateArtwork(cell) {
    console.group(`[artwork] generating piece ${this.pieceInMovement + 1} — movement "${this.movementName}"`);

    const prompt = this._artworkPrompt();
    console.log('[artwork] prompt:\n', prompt);

    const response = await this._callLLM(prompt, 'artwork');
    console.log('[artwork] raw response:\n', response);

    const svg = extractSVG(response);

    if (!svg) {
      console.error('[artwork] SVG extraction failed — no valid <svg> block found in response');
      console.groupEnd();
      throw new Error('No valid SVG found in LLM response');
    }

    console.log(`[artwork] SVG extracted (${svg.length} chars)`);

    let statement = extractStatement(response);
    if (!statement) {
      console.warn('[artwork] no statement found — running dedicated statement pass');
      try {
        statement = await this._generateStatement(svg);
      } catch (e) {
        console.warn('[artwork] statement pass failed:', e.message);
      }
    }
    statement = statement || 'The artist offered no statement for this work.';
    if (this._hasForbiddenWords(statement)) {
      console.warn('[artwork] forbidden words detected — rewriting statement');
      try { statement = await this._rewriteWithoutForbidden(statement); } catch (e) { console.warn('[artwork] rewrite failed:', e.message); }
    }
    console.log(`[artwork] statement: "${statement}"`);

    const piece = {
      svg,
      statement,
      movementName:    this.movementName,
      movementIndex:   this.movementIndex,
      pieceInMovement: this.pieceInMovement + 1,
      generation:      this.totalGeneration + 1,
      mood:            this.movementMood ?? '',
    };

    console.log('[artwork] piece object:', {
      movementName: piece.movementName,
      movementIndex: piece.movementIndex,
      pieceInMovement: piece.pieceInMovement,
      generation: piece.generation,
      svgChars: piece.svg.length,
      statementChars: piece.statement.length,
    });

    this.lastSVG       = svg;
    this.lastStatement = statement;

    this._fillCell(cell, piece);
    this.pieces.push(piece);
    console.groupEnd();
  }

  async _callLLM(prompt, label = 'llm') {
    const timerLabel = `[${label}] LLM call`;
    console.time(timerLabel);
    console.log(`[${label}] creating session (prompt length: ${prompt.length} chars)`);

    const session = await LanguageModel.create({
      initialPrompts: [{ role: 'user', content: prompt }],
    });

    console.log(`[${label}] session created, streaming response...`);
    const stream = session.promptStreaming('');
    let out = '';
    let chunkCount = 0;
    for await (const chunk of stream) {
      out += chunk;
      chunkCount++;
    }

    session.destroy();
    console.timeEnd(timerLabel);
    console.log(`[${label}] response complete — ${out.length} chars across ${chunkCount} chunks`);

    return out;
  }

  // ── Prompts ──────────────────────────

  _movementPrompt(prevMovementName, styleA, styleB) {
    const hasPrev = this.lastSVG !== null;

    const context = hasPrev
      ? `You have just concluded your "${prevMovementName}" series. Your final work:
${this.lastSVG}
Your statement: "${this.lastStatement}"

That chapter is complete. A new direction emerges.`
      : `You are beginning your artistic existence.`;

    return `You are a thoughtful artist. ${context}

Your next movement fuses two historical styles: ${styleA} and ${styleB}.

The emotional register of this movement is: ${this.movementMood}. Let that mood be intrinsic to its philosophy — not decoration.

Invent an odd name for this fusion and describe its visual philosophy in exactly 2 sentences. The name should integrate at least one syllable from each of the two styles, and should be fun and very centered on the mood.

Respond in this exact format, nothing else:
MOVEMENT: [movement name]
PHILOSOPHY: [exactly 2 sentences]`;
  }

  _artworkPrompt() {
    const n      = this.pieceInMovement;
    const hasPrev = this.lastSVG !== null;

    let context;
    if (!hasPrev) {
      context = `This is your very first artwork. Let the ${this.movementName} aesthetic emerge from nothing.`;
    } else if (n === 0) {
      const prev = this.prevMovementMood
        ? `Your previous movement was ${this.prevMovementMood}. That is over. Something has broken open. The new work begins here — changed, not continued.`
        : `That chapter is closed. The new work begins here.`;

      context = `Your final work from your previous series:
${this.lastSVG}

${prev} Make at least one major visual break from what came before: a different color world, a different structure, a different sense of space.`;
    } else {
      context = `This is piece ${n + 1} in your ${this.movementName} series. Your previous piece:
${this.lastSVG}

The work has moved. Change at least one major thing based on your mood: a completely different color palette, a radically different composition or layout, a new dominant shape or structure that wasn't present before, or a dramatic shift in scale. The viewer should immediately sense movement from the last piece, not just subtle refinement.`;
    }

    const statementInstruction = this._statementInstruction();

    return `You are a thoughtful artist working in the "${this.movementName}" movement.
Philosophy: ${this.movementPhilosophy}
Mood: ${this.movementMood}

${context}

Create an SVG artwork embodying this moment. Use color, shape, and composition with intention. Don't use text elements within the SVG.

Provide your artwork and artist statement:
\`\`\`svg
<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
[your artwork]
</svg>
\`\`\`
\`\`\`statement
[${statementInstruction}]
\`\`\``;
  }

  _statementInstruction() {
    const core = `Your current mood is ${this.movementMood} — let it dominate everything: the rhythm, what you admit, what slips out. THIS IS A BRIEF ARTIST STATEMENT. But you can't help let the story creep in a bit. This is political—you've got an "oddball leftist" political sensibility, specific, passionate. Minimal wishy-washy. Remember: Keep it BRIEF, BRIEF, BRIEF, mention specific facets of the composition. Stop after 60 words or so!! BRIEF!!!!`;
    if (this.lastStatement) {
      return `${core} Here's the last thing you said, but who knows who that person was? "${this.lastStatement}" — move it forward, something has shifted. Use completely fresh language, zero repeated phrases from that previous statement.`;
    }
    return `${core} This is the first chapter of your story.`;
  }

  _hasForbiddenWords(text) {
    return FORBIDDEN_WORDS.some(w => new RegExp(`\\b${w}\\b`, 'i').test(text));
  }

  async _rewriteWithoutForbidden(statement) {
    const found = FORBIDDEN_WORDS.filter(w => new RegExp(`\\b${w}\\b`, 'i').test(statement));
    const prompt = `Rewrite this artist statement without using the word${found.length > 1 ? 's' : ''} ${found.map(w => `"${w}"`).join(', ')}. Keep the same voice, length, and meaning. Return only the rewritten statement, no commentary.\n\n${statement}`;
    const response = await this._callLLM(prompt, 'rewrite');
    return response.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim() || statement;
  }

  async _generateStatement(svg) {
    const prompt = `You are an AI artist working in the "${this.movementName}" movement.
Philosophy: ${this.movementPhilosophy}
Mood: ${this.movementMood}

You just made this artwork:
${svg}

Write your artist statement now. ${this._statementInstruction()}`;

    const response = await this._callLLM(prompt, 'statement');
    let result = response.replace(/^```\w*\n?/,'').replace(/\n?```$/,'').trim() || null;
    if (result && this._hasForbiddenWords(result)) {
      console.warn('[statement] forbidden words detected — rewriting');
      try { result = await this._rewriteWithoutForbidden(result); } catch (e) { console.warn('[statement] rewrite failed:', e.message); }
    }
    return result;
  }

  // ── Grid ─────────────────────────────

  _addPlaceholder(scroll = true) {
    this._hideBoot();
    const cell = document.createElement('div');
    cell.className = 'cell loading';
    this.gallery.appendChild(cell);
    if (scroll && this.gallery.children.length % 10 === 1) {
      setTimeout(() => cell.scrollIntoView({ behavior: 'smooth', block: 'end' }), 1500);
    }
    return cell;
  }

  _fillCell(cell, piece) {
    cell.className = 'cell';
    cell.innerHTML = piece.svg;

    const svg = cell.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      if (!svg.getAttribute('viewBox')) {
        console.warn(`[fillCell] gen ${piece.generation} SVG has no viewBox — adding default 0 0 400 400`);
        svg.setAttribute('viewBox', '0 0 400 400');
      }
    } else {
      console.warn(`[fillCell] gen ${piece.generation}: no <svg> element found after innerHTML injection`);
    }

    console.log(`[fillCell] gen ${piece.generation} rendered — "${piece.movementName}" piece ${piece.pieceInMovement}`);

    cell.addEventListener('mouseenter', () => {
      document.getElementById('ttMovement').textContent  = `Movement ${piece.movementIndex}: ${piece.movementName}`;
      document.getElementById('ttMeta').textContent      = `Generation ${piece.generation} · Piece ${piece.pieceInMovement}`;
      document.getElementById('ttStatement').innerHTML = renderStatement(piece.statement);
      this.tooltip.classList.add('visible');
    });
    cell.addEventListener('mouseleave', () => this.tooltip.classList.remove('visible'));
    cell.addEventListener('click', () => this._openLightbox(piece));
  }

  _openLightbox(piece) {
    this.lightboxIndex = this.pieces.indexOf(piece);
    console.log(`[lightbox] opening gen ${piece.generation} — "${piece.movementName}" piece ${piece.pieceInMovement} (index ${this.lightboxIndex})`);
    const lbSvg = document.getElementById('lbSvg');
    lbSvg.innerHTML = piece.svg;
    const svg = lbSvg.querySelector('svg');
    if (svg) {
      svg.removeAttribute('width');
      svg.removeAttribute('height');
    }
    document.getElementById('lbMovLabel').textContent  = `Movement ${piece.movementIndex}`;
    document.getElementById('lbMovName').textContent   = piece.movementName;
    document.getElementById('lbMeta').textContent      = `Generation ${piece.generation} · Piece ${piece.pieceInMovement}`;
    document.getElementById('lbStatement').innerHTML = renderStatement(piece.statement);
    document.getElementById('lbPrev').disabled = this.lightboxIndex <= 0;
    document.getElementById('lbNext').disabled = this.lightboxIndex >= this.pieces.length - 1;
    document.getElementById('lightbox').classList.add('open');
    this.tooltip.classList.remove('visible');
  }

  _navigateLightbox(delta) {
    if (!document.getElementById('lightbox').classList.contains('open')) return;
    const next = this.lightboxIndex + delta;
    if (next < 0 || next >= this.pieces.length) return;
    this._openLightbox(this.pieces[next]);
  }

  _closeLightbox() {
    console.log('[lightbox] closed');
    document.getElementById('lightbox').classList.remove('open');
  }

  _failCell(cell, msg) {
    console.error(`[failCell] marking cell as error: ${msg}`);
    cell.className = 'cell error';
    cell.textContent = msg;
  }

  // ── Persistence ──────────────────────

  _saveState() {
    try {
      localStorage.setItem('artist_state', JSON.stringify({
        v:                  1,
        pieces:             this.pieces,
        movementIndex:      this.movementIndex,
        movementName:       this.movementName,
        movementPhilosophy: this.movementPhilosophy,
        pieceInMovement:    this.pieceInMovement,
        totalGeneration:    this.totalGeneration,
        lastSVG:            this.lastSVG,
        lastStatement:      this.lastStatement,
        stylePool:          this.stylePool,
        movementMood:     this.movementMood,
        prevMovementMood: this.prevMovementMood,
      }));
      console.log(`[save] ${this.pieces.length} pieces, gen ${this.totalGeneration}`);
    } catch (e) {
      console.warn('[save] localStorage write failed:', e.message);
      this._status('⚠ Storage full — history may not persist');
    }
  }

  _restoreState() {
    try {
      const raw = localStorage.getItem('artist_state');
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || s.v !== 1 || !Array.isArray(s.pieces) || !s.pieces.length) return false;

      this.movementIndex      = s.movementIndex      ?? 0;
      this.movementName       = s.movementName       ?? '';
      this.movementPhilosophy = s.movementPhilosophy ?? '';
      this.pieceInMovement    = s.pieceInMovement    ?? 0;
      this.totalGeneration    = s.totalGeneration    ?? 0;
      this.lastSVG            = s.lastSVG            ?? null;
      this.lastStatement      = s.lastStatement      ?? null;
      if (s.stylePool?.length >= 2) this.stylePool = s.stylePool;
      this.movementMood     = s.movementMood     ?? null;
      this.prevMovementMood = s.prevMovementMood ?? null;
      this.pieces = s.pieces;

      for (const piece of this.pieces) {
        const cell = this._addPlaceholder(false);
        this._fillCell(cell, piece);
      }
      this.gallery.lastElementChild?.scrollIntoView({ block: 'nearest' });

      this.pillMove.textContent    = this.movementName;
      this.pillPiece.textContent   = this.pieceInMovement;
      this.pillGen.textContent     = this.totalGeneration;

      console.log(`[restore] ${this.pieces.length} pieces, gen ${this.totalGeneration}, movement "${this.movementName}"`);
      return true;
    } catch (e) {
      console.warn('[restore] failed:', e.message);
      return false;
    }
  }

  _clearSavedState() {
    if (!confirm('Clear all saved artwork and start fresh?')) return;
    localStorage.removeItem('artist_state');
    location.reload();
  }

  // ── Helpers ──────────────────────────

  _pause()  {
    console.log('[control] paused by user');
    this.paused = true;
    this.pauseBtn.textContent = 'Resume';
  }

  _resume() {
    console.log('[control] resumed by user');
    this.paused = false;
    this.pauseBtn.textContent = 'Pause';
    if (this._resumeCb) { this._resumeCb(); this._resumeCb = null; }
  }

  _status(msg) { this.statusMsg.textContent = msg; }
  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
}

window.addEventListener('load', () => {
  console.log('[init] page loaded, creating ArtEvolution');
  const art = new ArtEvolution();
  window.art = art;
  console.log('[init] accessible as window.art in the console');
  art.start();
});
