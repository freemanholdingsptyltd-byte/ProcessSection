/**
 * TechStack Sydney — How We Build
 * Vanilla JS controller for:
 *  - Wide, smooth, exaggerated S-curve path across mobile, tablet, laptop & desktop
 *  - Visible guide track + progressive gradient ribbon drawn behind the orb
 *  - Motion-blurred slate circle + 6-dot moving-RGB lighter circle tail
 *  - Atmospheric multi-plane parallax backdrop canvas with orb spotlight & stage ripples
 *  - Strict middle-of-screen (50vh) persistent title pop-up reveals
 *  - Mid-screen calibrated anchor navigation & arrival confetti
 */

(function () {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const stageEl = document.getElementById('journey-main');
  const svgEl = document.getElementById('journey-svg');
  const guidePath = document.getElementById('journey-guide-path');
  const purpleGlowPath = document.getElementById('journey-purple-glow');
  const cometGrad = document.getElementById('trail-comet-grad');
  const purpleGlowGrad = document.getElementById('purple-glow-grad');
  const lightOrb = document.getElementById('light-orb');
  const trailDots = Array.from(document.querySelectorAll('.trail-dot'));
  const progressLine = document.getElementById('scroll-progress-line');
  const scrollCueEl = document.getElementById('scroll-cue');
  const backdropCanvas = document.getElementById('journey-backdrop-canvas');

  const TRAIL_OPACITIES = [0.78, 0.62, 0.46, 0.32, 0.18, 0.08];
  const MAX_TRAIL_SPREAD = 104;
  const COMET_TRAIL_LENGTH = 620;
  const SCREEN_MID_RATIO = 0.5;

  let pathTotalLength = 0;
  let waypointPositions = [];
  let scrollCueBottomY = 0;
  let targetDrawLen = 0;
  let smoothDrawLen = 0;
  let trailAnchorLen = 0;
  let trailInitialized = false;
  let runnerRafId = 0;
  let backdropRafId = 0;
  let lastRevealedId = '';
  let currentScrollProgress = 0;
  let lastOrbViewportX = -999;
  let lastOrbViewportY = -999;
  let lastOrbEnergy = 0;
  let lastRunnerOpacity = 0;

  // Milestone ripples spawned on the backdrop canvas when a stage locks in at 50vh
  const activeRipples = [];

  // Multi-plane parallax depth particles for the backdrop canvas
  const DEPTH_NODES = Array.from({ length: 34 }, (_, i) => {
    const layer = i % 3; // 0 = far, 1 = mid, 2 = near
    return {
      xNorm: ((i * 73 + 19) % 100) / 100,
      yBase: ((i * 137 + 41) % 100) / 100,
      layer,
      parallax: layer === 0 ? 0.14 : layer === 1 ? 0.32 : 0.56,
      radius: layer === 0 ? 1.3 : layer === 1 ? 2.0 : 2.8,
      phase: i * 0.85,
      isCross: i % 5 === 0,
    };
  });

  // =========================================================================
  // 1. Wide, Smooth, Exaggerated Monotonic S-Curve Path
  // =========================================================================

  function getOrderedWaypoints() {
    const order = [
      'w-origin',
      'w-discovery',
      'w-preparation',
      'w-build',
      'w-testing',
      'w-golive',
    ];
    return order
      .map((key) => document.querySelector(`[data-waypoint="${key}"]`))
      .filter((el) => el !== null);
  }

  function getStageObstacle(stageSection, stageRect) {
    if (!stageSection) return null;

    const isRevealed = stageSection.classList.contains('is-revealed');
    const headlineEl = stageSection.querySelector('.section-headline');
    const visualEl =
      stageSection.querySelector(
        '.slot-visual .stage-card, .slot-visual .minimal-agenda, .slot-visual .minimal-arch, .slot-visual .minimal-sheet'
      ) || stageSection.querySelector('.slot-visual');

    if (!headlineEl && !visualEl) return null;

    const getBox = (el, unrevealedTopShift, unrevealedPadX) => {
      const r = el.getBoundingClientRect();
      return {
        top: r.top - stageRect.top - (isRevealed ? 0 : unrevealedTopShift),
        bottom: r.bottom - stageRect.top,
        left: r.left - stageRect.left - (isRevealed ? 0 : unrevealedPadX),
        right: r.right - stageRect.left + (isRevealed ? 0 : unrevealedPadX),
      };
    };

    const hBox = headlineEl ? getBox(headlineEl, 12, 2) : null;
    const vBox = visualEl ? getBox(visualEl, 26, 6) : null;
    const boxes = [hBox, vBox].filter(Boolean);

    let top = Infinity;
    let bottom = -Infinity;
    let left = Infinity;
    let right = -Infinity;

    boxes.forEach((b) => {
      top = Math.min(top, b.top);
      bottom = Math.max(bottom, b.bottom);
      left = Math.min(left, b.left);
      right = Math.max(right, b.right);
    });

    let corridorLeft = null;
    let corridorRight = null;
    const isReversed = Boolean(stageSection.querySelector('.stage-split.is-reversed'));
    if (hBox && vBox) {
      const leftColBox = isReversed ? vBox : hBox;
      const rightColBox = isReversed ? hBox : vBox;
      corridorLeft = leftColBox.right;
      corridorRight = rightColBox.left;
    }

    return { top, bottom, left, right, corridorLeft, corridorRight };
  }

  function buildJourneyPath() {
    if (!stageEl || !svgEl || !guidePath) return;

    const stageRect = stageEl.getBoundingClientRect();
    const width = stageEl.offsetWidth;
    const height = stageEl.offsetHeight;
    const vw = window.innerWidth;
    const isMobile = vw < 768;

    svgEl.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svgEl.setAttribute('width', String(width));
    svgEl.setAttribute('height', String(height));

    if (scrollCueEl) {
      const cueRect = scrollCueEl.getBoundingClientRect();
      scrollCueBottomY = cueRect.bottom - stageRect.top;
    }

    const maskRect = document.getElementById('journey-mask-rect');
    if (maskRect) {
      const maskTop = Math.max(0, scrollCueBottomY + 10);
      maskRect.setAttribute('y', maskTop.toFixed(1));
      maskRect.setAttribute('height', Math.max(0, height - maskTop).toFixed(1));
    }

    const nodes = getOrderedWaypoints();
    if (nodes.length < 2) return;

    const points = nodes.map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        el,
        key: el.getAttribute('data-waypoint') || '',
        x: rect.left - stageRect.left + rect.width / 2,
        y: rect.top - stageRect.top + rect.height / 2,
      };
    });

    waypointPositions = points;

    const stageIds = ['stage-discovery', 'stage-preparation', 'stage-build', 'stage-testing'];
    const obstacles = [
      null,
      ...stageIds.map((id) => getStageObstacle(document.getElementById(id), stageRect)),
    ];

    const goliveHeadline = document.querySelector('#stage-golive .golive-headline');
    const goliveHeadlineRect = goliveHeadline ? goliveHeadline.getBoundingClientRect() : null;

    const centerX = width / 2;
    const anchors = [];

    function pushAnchor(x, y) {
      const prev = anchors[anchors.length - 1];
      if (!prev) {
        anchors.push({ x, y });
        return;
      }
      const safeY = Math.max(prev.y + 4, y);
      anchors.push({ x, y: safeY });
    }

    const originPt = points[0];
    const golivePt = points[points.length - 1];
    const cueClearY = Math.max(originPt.y + 8, scrollCueBottomY + 18);

    pushAnchor(isMobile ? centerX : originPt.x, originPt.y);
    pushAnchor(isMobile ? centerX : originPt.x, cueClearY);

    if (isMobile) {
      const goliveTargetY = goliveHeadlineRect
        ? Math.min(golivePt.y, goliveHeadlineRect.top - stageRect.top - 22)
        : golivePt.y;

      for (let s = 1; s <= 4; s++) {
        const wPt = points[s];
        const obs = obstacles[s];
        const prevY = anchors[anchors.length - 1].y;
        const rawLandY = obs ? Math.min(wPt.y, obs.top - 40) : wPt.y;
        const landY = Math.max(prevY + 12, rawLandY);

        if (landY - prevY >= 92) {
          const swingDir = s % 2 === 1 ? 1 : -1;
          const amp = Math.max(68, centerX - 24);
          pushAnchor(centerX + swingDir * amp, (prevY + landY) / 2);
        }

        pushAnchor(centerX, landY);

        if (obs) {
          const dir = s % 2 === 1 ? -1 : 1;
          const desiredRight = obs.right + 30;
          const rightX =
            desiredRight <= width - 16 ? desiredRight : Math.max(desiredRight, width + 22);
          const desiredLeft = obs.left - 30;
          const leftX = desiredLeft >= 16 ? desiredLeft : Math.min(desiredLeft, -22);
          const detourX = dir > 0 ? rightX : leftX;

          const topEdgeY = Math.max(landY + 18, obs.top - 10);
          const botEdgeY = Math.max(topEdgeY + 20, obs.bottom + 14);

          pushAnchor(detourX, topEdgeY);
          pushAnchor(detourX, botEdgeY);

          const nextObs = s < 4 ? obstacles[s + 1] : null;
          const nextTargetY =
            s < 4
              ? nextObs
                ? Math.min(points[s + 1].y, nextObs.top - 40)
                : points[s + 1].y
              : goliveTargetY;
          const returnY = Math.min(botEdgeY + 34, nextTargetY - 14);

          if (returnY >= botEdgeY + 18) {
            pushAnchor(centerX, returnY);
          }
        }
      }

      pushAnchor(centerX, Math.max(anchors[anchors.length - 1].y + 12, goliveTargetY));
    } else {
      const swingMargin = 44;
      const amplitude = Math.min(340, Math.max(150, width * 0.31));

      for (let s = 1; s <= 4; s++) {
        const wPt = points[s];
        const obs = obstacles[s];
        const prevY = anchors[anchors.length - 1].y;

        let spineX = wPt.x;
        if (obs && obs.corridorLeft !== null && obs.corridorRight !== null) {
          const gapW = obs.corridorRight - obs.corridorLeft;
          if (gapW >= 44) {
            spineX = Math.max(obs.corridorLeft + 22, Math.min(obs.corridorRight - 22, wPt.x));
          } else {
            spineX = (obs.corridorLeft + obs.corridorRight) / 2;
          }
        }

        const rawEntryY = obs ? Math.min(wPt.y - 12, obs.top - 24) : wPt.y - 12;
        const entryY = Math.max(prevY + 16, rawEntryY);
        const rawExitY = obs ? Math.max(wPt.y + 12, obs.bottom + 24) : wPt.y + 12;

        if (entryY - prevY >= 56) {
          const dir = s % 2 === 1 ? 1 : -1;
          const swingX = Math.max(
            swingMargin,
            Math.min(width - swingMargin, centerX + dir * amplitude)
          );
          pushAnchor(swingX, (prevY + entryY) / 2);
        }

        pushAnchor(spineX, entryY);
        const midY = Math.max(anchors[anchors.length - 1].y + 8, wPt.y);
        pushAnchor(spineX, midY);
        const exitY = Math.max(anchors[anchors.length - 1].y + 8, rawExitY);
        pushAnchor(spineX, exitY);
      }

      const prevY = anchors[anchors.length - 1].y;
      const goliveX = goliveHeadlineRect
        ? Math.min(golivePt.x, goliveHeadlineRect.left - stageRect.left - 28)
        : golivePt.x;
      const goliveTop = goliveHeadlineRect
        ? goliveHeadlineRect.top - stageRect.top
        : golivePt.y - 24;
      const goliveEntryY = Math.max(prevY + 16, Math.min(golivePt.y - 12, goliveTop - 24));

      if (goliveEntryY - prevY >= 56) {
        const swingX = Math.max(swingMargin, Math.min(width - swingMargin, centerX - amplitude));
        pushAnchor(swingX, (prevY + goliveEntryY) / 2);
      }

      pushAnchor(goliveX, goliveEntryY);
      pushAnchor(goliveX, Math.max(anchors[anchors.length - 1].y + 8, golivePt.y));
    }

    let d = `M ${anchors[0].x.toFixed(1)} ${anchors[0].y.toFixed(1)}`;
    for (let i = 0; i < anchors.length - 1; i++) {
      const p0 = anchors[i];
      const p1 = anchors[i + 1];
      const dy = p1.y - p0.y;
      const h = dy * 0.48;
      d += [
        ` C ${p0.x.toFixed(1)} ${(p0.y + h).toFixed(1)},`,
        ` ${p1.x.toFixed(1)} ${(p1.y - h).toFixed(1)},`,
        ` ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`,
      ].join('');
    }

    guidePath.setAttribute('d', d);
    if (purpleGlowPath) purpleGlowPath.setAttribute('d', d);

    pathTotalLength = guidePath.getTotalLength();

    resizeBackdropCanvas();
    updateScrollProgress();
  }

  function findLengthAtY(targetY) {
    if (!guidePath || pathTotalLength <= 0) return 0;
    let low = 0;
    let high = pathTotalLength;
    for (let i = 0; i < 20; i++) {
      const mid = (low + high) / 2;
      const pt = guidePath.getPointAtLength(mid);
      if (pt.y < targetY) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return (low + high) / 2;
  }

  function getTangentAngle(len, stepSign) {
    const aheadLen = Math.max(0, Math.min(pathTotalLength, len + stepSign * 4));
    const behindLen = Math.max(0, Math.min(pathTotalLength, len - stepSign * 4));
    const pA = guidePath.getPointAtLength(aheadLen);
    const pB = guidePath.getPointAtLength(behindLen);
    return Math.hypot(pA.x - pB.x, pA.y - pB.y) > 0.2
      ? (Math.atan2(pA.y - pB.y, pA.x - pB.x) * 180) / Math.PI
      : 90;
  }

  function getSectionAnchorEl(sectionEl) {
    return sectionEl?.querySelector('[data-waypoint]') || sectionEl;
  }

  // =========================================================================
  // 2. Orb, Moving-RGB Tail & Progressive Drawn Ribbon
  // =========================================================================

  function renderOrbAndTrail() {
    if (!guidePath || pathTotalLength <= 0) return;

    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 720;
    const isMobile = vw < 768;
    const activeCometLen = isMobile
      ? Math.max(120, Math.min(220, Math.round(vh * 0.28)))
      : COMET_TRAIL_LENGTH;

    const orbPt = guidePath.getPointAtLength(smoothDrawLen);
    const velocity = Math.abs(targetDrawLen - smoothDrawLen);
    const gap = smoothDrawLen - trailAnchorLen;
    const absGap = Math.abs(gap);
    const stepSign = gap >= 0 ? 1 : -1;
    const angleDeg = getTangentAngle(smoothDrawLen, stepSign);

    const energy = prefersReducedMotion.matches
      ? 0
      : Math.min(1, (velocity * 0.55 + absGap * 0.45) / 30);
    const blurPx = prefersReducedMotion.matches ? 0 : energy * 2.4;

    const cueCutoffY = scrollCueBottomY + 12;
    const pastScrollCue = orbPt.y > cueCutoffY ? 1 : 0;
    let runnerOpacity = 0;
    if (!prefersReducedMotion.matches) {
      const distToEnd = Math.max(0, pathTotalLength - smoothDrawLen);
      const endFade = distToEnd >= 115 ? 1 : Math.max(0, (distToEnd - 12) / 103);
      runnerOpacity = pastScrollCue * endFade;
    }

    const segLen = Math.min(activeCometLen, smoothDrawLen);
    const startGap = Math.max(0, smoothDrawLen - segLen);
    const showComet =
      !prefersReducedMotion.matches && pastScrollCue === 1 && segLen >= 4 && runnerOpacity > 0.01;

    const dashPattern = `${segLen.toFixed(1)} ${(pathTotalLength + 1000).toFixed(1)}`;
    const segOffset = (-startGap).toFixed(1);
    guidePath.style.strokeDasharray = dashPattern;
    guidePath.style.strokeDashoffset = segOffset;
    if (purpleGlowPath) {
      purpleGlowPath.style.strokeDasharray = dashPattern;
      purpleGlowPath.style.strokeDashoffset = segOffset;
    }

    if (showComet) {
      const tailStartPt = guidePath.getPointAtLength(startGap);
      [cometGrad, purpleGlowGrad].forEach((gradEl) => {
        if (!gradEl) return;
        gradEl.setAttribute('x1', tailStartPt.x.toFixed(1));
        gradEl.setAttribute('y1', tailStartPt.y.toFixed(1));
        gradEl.setAttribute('x2', orbPt.x.toFixed(1));
        gradEl.setAttribute('y2', orbPt.y.toFixed(1));
      });
    }

    if (stageEl) {
      const stageRect = stageEl.getBoundingClientRect();
      lastOrbViewportX = stageRect.left + orbPt.x;
      lastOrbViewportY = stageRect.top + orbPt.y;
      lastOrbEnergy = energy;
      lastRunnerOpacity = runnerOpacity;

      stageEl.style.setProperty('--orb-energy', energy.toFixed(3));
      stageEl.style.setProperty('--orb-blur', blurPx.toFixed(2));
      stageEl.style.setProperty('--runner-opacity', (showComet ? runnerOpacity : 0).toFixed(3));
    }

    if (lightOrb) {
      lightOrb.style.transform = `translate3d(${orbPt.x.toFixed(1)}px, ${orbPt.y.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${angleDeg.toFixed(1)}deg)`;
    }

    if (prefersReducedMotion.matches || absGap < 0.8 || runnerOpacity <= 0.01) {
      trailDots.forEach((dotEl) => {
        dotEl.style.opacity = '0';
      });
      return;
    }

    const dir = gap >= 0 ? -1 : 1;
    const spread = Math.min(isMobile ? 64 : MAX_TRAIL_SPREAD, absGap * 1.65);
    const catchFade = Math.min(1, absGap / 22);

    trailDots.forEach((dotEl) => {
      const idx = Number(dotEl.getAttribute('data-trail-index') || '0');
      const dotLen = smoothDrawLen + dir * ((idx + 1) / 6) * spread;

      if (dotLen < 0 || dotLen > pathTotalLength) {
        dotEl.style.opacity = '0';
        return;
      }

      const pt = guidePath.getPointAtLength(dotLen);
      if (pt.y <= cueCutoffY) {
        dotEl.style.opacity = '0';
        return;
      }

      const cueFade = Math.min(1, (pt.y - cueCutoffY) / 18);
      const scale = Math.max(0.35, 0.92 - idx * 0.11);
      const opacity = (TRAIL_OPACITIES[idx] ?? 0) * catchFade * cueFade;

      dotEl.style.opacity = opacity.toFixed(3);
      dotEl.style.transform = `translate3d(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(2)})`;
    });
  }

  // =========================================================================
  // 3. Mid-Screen (50vh) Persistent Stage Reveals & Kinetic Ripples
  // =========================================================================

  function triggerMilestoneRipple(viewportX, viewportY) {
    if (prefersReducedMotion.matches) return;
    activeRipples.push({
      x: viewportX,
      y: viewportY,
      docY: viewportY + window.scrollY,
      progress: 0,
    });
  }

  function updateMidScreenReveals() {
    const viewportH = window.innerHeight || 800;
    const midY = viewportH * SCREEN_MID_RATIO;
    const stages = Array.from(document.querySelectorAll('.stage[data-stage]'));
    let deepestRevealed = '';

    stages.forEach((sec) => {
      const anchorEl = getSectionAnchorEl(sec);
      if (!anchorEl) return;

      const rect = anchorEl.getBoundingClientRect();
      const anchorViewportY = rect.top + rect.height / 2;
      const wasRevealed = sec.classList.contains('is-revealed');

      const shouldReveal = wasRevealed
        ? anchorViewportY <= midY + viewportH * 0.06
        : anchorViewportY <= midY + viewportH * 0.01;

      if (shouldReveal && !wasRevealed) {
        triggerMilestoneRipple(rect.left + rect.width / 2, anchorViewportY);
      }

      sec.classList.toggle('is-revealed', shouldReveal);
      if (shouldReveal) {
        deepestRevealed = sec.getAttribute('data-stage') || '';
      }
    });

    if (deepestRevealed !== lastRevealedId) {
      lastRevealedId = deepestRevealed;
      updateActiveNav();
    }
  }

  // =========================================================================
  // 4. Atmospheric Parallax Spatial Backdrop Canvas
  // =========================================================================

  let backdropW = 0;
  let backdropH = 0;
  let backdropDpr = 1;

  function resizeBackdropCanvas() {
    if (!backdropCanvas) return;
    backdropDpr = Math.min(window.devicePixelRatio || 1, 2);
    backdropW = window.innerWidth;
    backdropH = window.innerHeight;
    backdropCanvas.width = Math.floor(backdropW * backdropDpr);
    backdropCanvas.height = Math.floor(backdropH * backdropDpr);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function drawBackdropFrame(nowMs) {
    if (!backdropCanvas) return;
    const ctx = backdropCanvas.getContext('2d');
    if (!ctx) return;

    if (backdropW === 0 || backdropH === 0) resizeBackdropCanvas();

    ctx.setTransform(backdropDpr, 0, 0, backdropDpr, 0, 0);
    ctx.clearRect(0, 0, backdropW, backdropH);

    const time = prefersReducedMotion.matches ? 0 : nowMs * 0.001;
    const p = currentScrollProgress;
    const scrollY = window.scrollY || 0;

    // A. Evolving multi-stage atmospheric washes
    const driftX1 = Math.sin(time * 0.25 + p * 3.1) * backdropW * 0.14;
    const bloom1X = lerp(backdropW * 0.22, backdropW * 0.78, p) + driftX1;
    const bloom1Y = lerp(backdropH * 0.24, backdropH * 0.38, Math.sin(p * Math.PI));
    const r1 = Math.max(backdropW, backdropH) * 0.58;

    const grad1 = ctx.createRadialGradient(bloom1X, bloom1Y, 0, bloom1X, bloom1Y, r1);
    const violetAlpha = lerp(0.065, 0.125, Math.sin(p * Math.PI));
    const skyAlpha = lerp(0.02, 0.11, p);
    grad1.addColorStop(0, `rgba(124, 58, 237, ${violetAlpha.toFixed(3)})`);
    grad1.addColorStop(0.45, `rgba(79, 70, 229, ${(violetAlpha * 0.55).toFixed(3)})`);
    grad1.addColorStop(1, 'rgba(248, 247, 252, 0)');
    ctx.fillStyle = grad1;
    ctx.fillRect(0, 0, backdropW, backdropH);

    const bloom2X = lerp(backdropW * 0.82, backdropW * 0.28, p) - driftX1 * 0.6;
    const bloom2Y = lerp(backdropH * 0.78, backdropH * 0.56, p);
    const r2 = Math.max(backdropW, backdropH) * 0.52;

    const grad2 = ctx.createRadialGradient(bloom2X, bloom2Y, 0, bloom2X, bloom2Y, r2);
    grad2.addColorStop(0, `rgba(14, 165, 233, ${skyAlpha.toFixed(3)})`);
    grad2.addColorStop(0.5, `rgba(99, 102, 241, ${(skyAlpha * 0.45).toFixed(3)})`);
    grad2.addColorStop(1, 'rgba(248, 247, 252, 0)');
    ctx.fillStyle = grad2;
    ctx.fillRect(0, 0, backdropW, backdropH);

    // Fade subtle contours and depth nodes cleanly out near Stage 5 arrival so no lines or dots remain at the end
    const endQuietFactor = p > 0.86 ? Math.max(0, 1 - (p - 0.86) / 0.11) : 1;

    // B. Subtle parallax architectural horizon contours that glide as you scroll
    if (endQuietFactor > 0.01) {
      const contourCount = 5;
      for (let c = 0; c < contourCount; c++) {
        const baseSpacing = backdropH * 0.28;
        const parallaxScroll = (scrollY * (0.12 + c * 0.035)) % (baseSpacing * contourCount);
        const yAnchor = ((c * baseSpacing - parallaxScroll + baseSpacing * contourCount) % (baseSpacing * contourCount)) - baseSpacing * 0.5;
        const waveAmp = 18 + c * 5;
        const waveFreq = (Math.PI * 2) / Math.max(backdropW, 640);

        ctx.beginPath();
        for (let x = 0; x <= backdropW; x += 48) {
          const wy =
            yAnchor +
            Math.sin(x * waveFreq + time * 0.22 + c * 1.3 + p * 2.4) * waveAmp +
            Math.cos(x * waveFreq * 0.5 - time * 0.15) * (waveAmp * 0.4);
          if (x === 0) ctx.moveTo(x, wy);
          else ctx.lineTo(x, wy);
        }
        ctx.strokeStyle = `rgba(99, 102, 241, ${((0.035 + (c % 2) * 0.015) * endQuietFactor).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // C. Reactive orb halo spotlight illuminating the space around the traveling circle
    const spotlightActive = lastRunnerOpacity > 0.02 && lastOrbViewportY > -150 && lastOrbViewportY < backdropH + 150;
    if (spotlightActive) {
      const spotRadius = 155 + lastOrbEnergy * 75;
      const spotGrad = ctx.createRadialGradient(
        lastOrbViewportX,
        lastOrbViewportY,
        0,
        lastOrbViewportX,
        lastOrbViewportY,
        spotRadius
      );
      const spotAlpha = (0.08 + lastOrbEnergy * 0.08) * lastRunnerOpacity;
      spotGrad.addColorStop(0, `rgba(124, 58, 237, ${spotAlpha.toFixed(3)})`);
      spotGrad.addColorStop(0.5, `rgba(14, 165, 233, ${(spotAlpha * 0.45).toFixed(3)})`);
      spotGrad.addColorStop(1, 'rgba(248, 247, 252, 0)');
      ctx.fillStyle = spotGrad;
      ctx.fillRect(0, 0, backdropW, backdropH);
    }

    // D. Multi-plane parallax depth particles & subtle coordinate crosshairs
    if (endQuietFactor > 0.01) {
      DEPTH_NODES.forEach((node) => {
        const driftX = Math.sin(time * 0.35 + node.phase) * (8 + node.layer * 5);
        const px = node.xNorm * backdropW + driftX;
        const rawY = node.yBase * (backdropH + 140) - scrollY * node.parallax;
        const wrapH = backdropH + 140;
        const py = (((rawY % wrapH) + wrapH) % wrapH) - 70;

        let proximityBoost = 0;
        if (spotlightActive) {
          const dist = Math.hypot(px - lastOrbViewportX, py - lastOrbViewportY);
          if (dist < 170) {
            proximityBoost = (1 - dist / 170) * 0.24 * lastRunnerOpacity;
          }
        }

        const baseAlpha = node.layer === 0 ? 0.08 : node.layer === 1 ? 0.12 : 0.16;
        const alpha = Math.min(0.45, baseAlpha + proximityBoost) * endQuietFactor;

        if (node.isCross) {
          const arm = 3.5 + node.layer * 1.2 + proximityBoost * 6;
          ctx.strokeStyle = `rgba(79, 70, 229, ${(alpha * 0.85).toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px - arm, py);
          ctx.lineTo(px + arm, py);
          ctx.moveTo(px, py - arm);
          ctx.lineTo(px, py + arm);
          ctx.stroke();
        } else {
          ctx.fillStyle =
            proximityBoost > 0.05
              ? `rgba(124, 58, 237, ${alpha.toFixed(3)})`
              : `rgba(100, 116, 139, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(px, py, node.radius + proximityBoost * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // E. Expanding architectural milestone ripples when stages reveal at 50vh
    for (let i = activeRipples.length - 1; i >= 0; i--) {
      const rip = activeRipples[i];
      rip.progress += 0.022;
      if (rip.progress >= 1) {
        activeRipples.splice(i, 1);
        continue;
      }

      const easeOut = 1 - Math.pow(1 - rip.progress, 3);
      const currentY = rip.docY - scrollY;
      const radius1 = 12 + easeOut * 110;
      const radius2 = 6 + easeOut * 66;
      const alpha = (1 - rip.progress) * 0.34;

      ctx.strokeStyle = `rgba(124, 58, 237, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(rip.x, currentY, radius1, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(2, 132, 199, ${(alpha * 0.75).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(rip.x, currentY, radius2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function startBackdropLoop() {
    if (prefersReducedMotion.matches) {
      drawBackdropFrame(0);
      return;
    }

    function loop(nowMs) {
      if (!document.hidden) {
        drawBackdropFrame(nowMs);
      }
      backdropRafId = window.requestAnimationFrame(loop);
    }

    if (backdropRafId) window.cancelAnimationFrame(backdropRafId);
    backdropRafId = window.requestAnimationFrame(loop);
  }

  // =========================================================================
  // 5. Scroll Progress & Runner Animation Loop
  // =========================================================================

  function stepRunnerLoop() {
    runnerRafId = 0;
    if (prefersReducedMotion.matches) return;

    const orbDiff = targetDrawLen - smoothDrawLen;
    if (Math.abs(orbDiff) <= 0.4) {
      smoothDrawLen = targetDrawLen;
    } else {
      smoothDrawLen += orbDiff * 0.24;
    }

    const trailDiff = smoothDrawLen - trailAnchorLen;
    if (Math.abs(trailDiff) <= 0.5) {
      trailAnchorLen = smoothDrawLen;
    } else {
      trailAnchorLen += trailDiff * 0.1;
    }

    renderOrbAndTrail();

    if (Math.abs(targetDrawLen - smoothDrawLen) > 0.4 || Math.abs(smoothDrawLen - trailAnchorLen) > 0.5) {
      runnerRafId = window.requestAnimationFrame(stepRunnerLoop);
    }
  }

  function ensureRunnerAnimating() {
    if (!runnerRafId && !prefersReducedMotion.matches) {
      runnerRafId = window.requestAnimationFrame(stepRunnerLoop);
    }
  }

  function updateScrollProgress() {
    if (!stageEl || !guidePath || pathTotalLength <= 0) return;

    const stageRect = stageEl.getBoundingClientRect();
    const viewportH = window.innerHeight || 800;
    const maxScroll = Math.max(document.documentElement.scrollHeight - viewportH, 1);
    const scrollProgress = Math.max(0, Math.min(1, window.scrollY / maxScroll));
    currentScrollProgress = scrollProgress;

    if (progressLine) {
      progressLine.style.setProperty('--scroll-progress', Math.max(0.03, scrollProgress).toFixed(4));
    }

    const allSections = Array.from(document.querySelectorAll('.hero-intro, .stage'));

    if (prefersReducedMotion.matches) {
      targetDrawLen = pathTotalLength;
      smoothDrawLen = pathTotalLength;
      trailAnchorLen = pathTotalLength;
      renderOrbAndTrail();
      drawBackdropFrame(0);
      allSections.forEach((sec) => sec.classList.add('is-revealed'));
      return;
    }

    const originY = waypointPositions[0]?.y || 0;
    const arrivalY = waypointPositions[waypointPositions.length - 1]?.y || stageEl.offsetHeight;
    const midScreenYInStage = -stageRect.top + viewportH * SCREEN_MID_RATIO;

    const startBlend = Math.min(1, window.scrollY / 110);
    const rawTargetY = originY + (midScreenYInStage - originY) * startBlend;
    const arrivalBlend = scrollProgress > 0.9 ? (scrollProgress - 0.9) / 0.1 : 0;
    const clampedY = Math.max(originY, Math.min(arrivalY, rawTargetY));
    const targetYInStage = clampedY + (arrivalY - clampedY) * arrivalBlend;

    const drawLen =
      window.scrollY <= 4
        ? 0
        : scrollProgress >= 0.992
          ? pathTotalLength
          : Math.min(pathTotalLength, Math.max(0, findLengthAtY(targetYInStage)));

    targetDrawLen = drawLen;
    if (!trailInitialized) {
      smoothDrawLen = drawLen;
      trailAnchorLen = drawLen;
      trailInitialized = true;
    }

    const arrivedAtEnd = drawLen >= pathTotalLength - 3;

    updateMidScreenReveals();
    renderOrbAndTrail();

    if (Math.abs(targetDrawLen - smoothDrawLen) > 0.4 || Math.abs(smoothDrawLen - trailAnchorLen) > 0.5) {
      ensureRunnerAnimating();
    }

    handleConfettiArrival(arrivedAtEnd);
  }

  function bindAnchorNavigation() {
    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    anchorLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href') || '';
        if (href.length < 2) return;
        const target = document.getElementById(href.slice(1));
        if (!target) return;

        e.preventDefault();
        const viewportH = window.innerHeight || 800;
        const maxScroll = Math.max(document.documentElement.scrollHeight - viewportH, 0);

        let desiredY = 0;
        if (target.id === 'top') {
          desiredY = 0;
        } else if (target.id === 'stage-golive') {
          desiredY = maxScroll;
        } else {
          const anchorEl = getSectionAnchorEl(target);
          const rect = anchorEl.getBoundingClientRect();
          const anchorDocY = rect.top + window.scrollY + rect.height / 2;
          desiredY = Math.max(0, Math.min(maxScroll, anchorDocY - viewportH * SCREEN_MID_RATIO));
        }

        window.scrollTo({
          top: desiredY,
          behavior: prefersReducedMotion.matches ? 'auto' : 'smooth',
        });
      });
    });
  }

  // =========================================================================
  // 6. Confetti Burst on Arrival
  // =========================================================================

  let confettiArmed = true;
  let confettiFrameId = 0;

  function handleConfettiArrival(arrivedAtEnd) {
    if (!arrivedAtEnd) {
      const scrollRatio = window.scrollY / Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      if (scrollRatio < 0.72) {
        confettiArmed = true;
      }
      return;
    }

    if (confettiArmed) {
      confettiArmed = false;
      launchConfettiFromArrival();
    }
  }

  function launchConfettiFromArrival() {
    const canvas = document.getElementById('confetti-canvas');
    const arrivalNode = document.querySelector('[data-waypoint="w-golive"]');
    if (!canvas || !arrivalNode || prefersReducedMotion.matches) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rect = arrivalNode.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;

    const palette = ['#7C3AED', '#4F46E5', '#0EA5E9', '#10B981', '#F59E0B'];
    const particles = Array.from({ length: 48 }, (_, i) => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
      const speed = 3.6 + Math.random() * 6.2;
      return {
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        w: 6 + Math.random() * 5,
        h: 3 + Math.random() * 2.5,
        rot: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 0.22,
        color: palette[i % palette.length],
        alpha: 1,
      };
    });

    if (confettiFrameId) window.cancelAnimationFrame(confettiFrameId);

    function tick() {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      let alive = 0;

      particles.forEach((p) => {
        p.vy += 0.22;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vRot;
        p.alpha -= 0.013;

        if (p.alpha > 0.02) {
          alive++;
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 2);
          ctx.fill();
          ctx.restore();
        }
      });

      if (alive > 0) {
        confettiFrameId = window.requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    }

    confettiFrameId = window.requestAnimationFrame(tick);
  }

  function updateActiveNav() {
    const navLinks = document.querySelectorAll('.header-nav .nav-link');
    navLinks.forEach((link) => {
      const href = link.getAttribute('href') || '';
      link.classList.toggle('is-active', lastRevealedId !== '' && href === `#${lastRevealedId}`);
    });
  }

  let scrollTicking = false;
  window.addEventListener(
    'scroll',
    () => {
      if (!scrollTicking) {
        scrollTicking = true;
        window.requestAnimationFrame(() => {
          updateScrollProgress();
          scrollTicking = false;
        });
      }
    },
    { passive: true }
  );

  window.addEventListener('resize', () => {
    window.requestAnimationFrame(buildJourneyPath);
  });

  if (typeof ResizeObserver !== 'undefined' && stageEl) {
    const ro = new ResizeObserver(() => {
      window.requestAnimationFrame(buildJourneyPath);
    });
    ro.observe(stageEl);
  }

  // =========================================================================
  // 7. Stage 5: Discovery Call Form Validation
  // =========================================================================

  const projectForm = document.getElementById('project-form');
  const confirmationBox = document.getElementById('form-confirmation');
  const confirmationBody = document.getElementById('confirmation-body');
  const resetFormBtn = document.getElementById('reset-form-btn');
  const nameInput = document.getElementById('owner-name');
  const emailInput = document.getElementById('owner-email');
  const businessSelect = document.getElementById('business-type');
  const errorName = document.getElementById('error-name');
  const errorEmail = document.getElementById('error-email');

  if (projectForm && confirmationBox) {
    projectForm.addEventListener('submit', (e) => {
      e.preventDefault();
      let valid = true;

      const nameVal = nameInput ? nameInput.value.trim() : '';
      const emailVal = emailInput ? emailInput.value.trim() : '';

      if (!nameVal) {
        valid = false;
        if (errorName) errorName.textContent = 'Please enter your name.';
      } else if (errorName) {
        errorName.textContent = '';
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
        valid = false;
        if (errorEmail) errorEmail.textContent = 'Please enter a valid email address.';
      } else if (errorEmail) {
        errorEmail.textContent = '';
      }

      if (!valid) return;

      const biz = businessSelect ? businessSelect.value : 'Service Business';
      if (confirmationBody) {
        confirmationBody.textContent = `Thanks ${nameVal}. Your 30-minute discovery call brief for ${biz.toLowerCase()} is ready for TechStack Sydney—we’ll follow up at ${emailVal}.`;
      }

      projectForm.hidden = true;
      confirmationBox.hidden = false;
    });
  }

  if (resetFormBtn && projectForm && confirmationBox) {
    resetFormBtn.addEventListener('click', () => {
      confirmationBox.hidden = true;
      projectForm.hidden = false;
      if (nameInput) nameInput.focus();
    });
  }

  // =========================================================================
  // 8. Stage 4: Interactive Dispatch Order Toggle
  // =========================================================================

  const previewToggleBtn = document.getElementById('preview-order-toggle');
  const dispatchList = document.getElementById('dispatch-list');
  const urgentLabel = document.getElementById('urgent-state-label');
  const feedbackTitle = document.getElementById('feedback-status-title');

  if (previewToggleBtn && dispatchList) {
    let prioritized = true;
    previewToggleBtn.addEventListener('click', () => {
      prioritized = !prioritized;
      const urgentRow = dispatchList.querySelector('[data-job="urgent"]');
      if (urgentRow) {
        if (prioritized) {
          dispatchList.prepend(urgentRow);
          urgentRow.classList.add('is-priority');
        } else {
          dispatchList.append(urgentRow);
          urgentRow.classList.remove('is-priority');
        }
      }
      if (urgentLabel) urgentLabel.textContent = prioritized ? 'Priority top' : 'Scheduled';
      if (feedbackTitle) feedbackTitle.textContent = prioritized ? 'Updated in preview' : 'Original queue';
      previewToggleBtn.textContent = prioritized ? 'Compare before' : 'Apply feedback';
    });
  }

  bindAnchorNavigation();

  if (document.readyState === 'complete') {
    buildJourneyPath();
  } else {
    window.addEventListener('load', buildJourneyPath);
  }
  buildJourneyPath();
  startBackdropLoop();
})();
