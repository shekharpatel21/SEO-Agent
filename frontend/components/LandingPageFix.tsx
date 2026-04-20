"use client";

import { useEffect } from "react";

export default function LandingPageFix() {
  useEffect(() => {
    const isTouchDevice =
      typeof window !== 'undefined' &&
      (window.matchMedia('(hover: none)').matches ||
        window.matchMedia('(pointer: coarse)').matches);

    // 1. License Modal Logic
    const openLicense = document.getElementById('openLicense');
    const closeLicense = document.getElementById('closeLicense');
    const licenseModal = document.getElementById('licenseModal');

    let licenseEscHandler: ((e: KeyboardEvent) => void) | null = null;

    if (openLicense && licenseModal) {
      const closeModal = () => {
        licenseModal.classList.remove('active');
        document.body.style.overflow = '';
      };

      openLicense.onclick = (e) => {
        e.preventDefault();
        licenseModal.classList.add('active');
        document.body.style.overflow = 'hidden';
      };

      if (closeLicense) {
        closeLicense.onclick = closeModal;
      }

      licenseModal.onclick = (e) => {
        if (e.target === licenseModal) closeModal();
      };

      licenseEscHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && licenseModal.classList.contains('active')) {
          closeModal();
        }
      };
      document.addEventListener('keydown', licenseEscHandler);
    }

    // 2. Mobile Nav Toggle
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');

    const closeMobileNav = () => {
      if (!navLinks || !navToggle) return;
      navLinks.classList.remove('mobile-open');
      navToggle.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    };

    let mqlMobileNav: MediaQueryList | null = null;
    let onBreakpointChange: (() => void) | null = null;
    let outsideNavClick: ((e: MouseEvent) => void) | null = null;

    if (navToggle && navLinks) {
      const toggle = (e?: Event) => {
        e?.preventDefault();
        e?.stopPropagation();
        const willOpen = !navLinks.classList.contains('mobile-open');
        navLinks.classList.toggle('mobile-open', willOpen);
        navToggle.classList.toggle('is-open', willOpen);
        navToggle.setAttribute('aria-expanded', String(willOpen));
        document.body.style.overflow = willOpen ? 'hidden' : '';
      };
      navToggle.onclick = toggle;

      // Tap anywhere outside the open menu to close
      outsideNavClick = (e: MouseEvent) => {
        if (!navLinks.classList.contains('mobile-open')) return;
        const target = e.target as Node;
        if (navToggle.contains(target) || navLinks.contains(target)) return;
        closeMobileNav();
      };
      document.addEventListener('click', outsideNavClick);

      // Close mobile nav when viewport grows past tablet breakpoint
      mqlMobileNav = window.matchMedia('(min-width: 769px)');
      onBreakpointChange = () => {
        if (mqlMobileNav!.matches) closeMobileNav();
      };
      if (mqlMobileNav.addEventListener) {
        mqlMobileNav.addEventListener('change', onBreakpointChange);
      }
    }

    // 3. Navbar Sticky
    const navbar = document.getElementById('navbar');
    let scrollTicking = false;

    const handleScroll = () => {
      if (!scrollTicking) {
        window.requestAnimationFrame(() => {
          if (window.scrollY > 50) {
            navbar?.classList.add('scrolled');
          } else {
            navbar?.classList.remove('scrolled');
          }
          scrollTicking = false;
        });
        scrollTicking = true;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    // 4. Smooth scroll for anchors
    const anchors = document.querySelectorAll('a[href^="#"]');
    anchors.forEach(anchor => {
      (anchor as HTMLAnchorElement).onclick = (e: MouseEvent) => {
        const href = anchor.getAttribute('href');
        if (!href || href === '#') return;

        let target: Element | null = null;
        try {
          target = document.querySelector(href);
        } catch {
          return;
        }
        if (!target) return;

        e.preventDefault();
        closeMobileNav();

        const navOffset = 72;
        const targetTop =
          target.getBoundingClientRect().top + window.pageYOffset - navOffset;
        const prefersReducedMotion = window.matchMedia(
          '(prefers-reduced-motion: reduce)'
        ).matches;
        window.scrollTo({
          top: targetTop,
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
        });
      };
    });

    // 5. Setup Tabs
    const tabBtns = document.querySelectorAll('.setup-tab-btn');
    tabBtns.forEach(btn => {
      (btn as HTMLElement).onclick = () => {
        const tabId = btn.getAttribute('data-tab');
        document.querySelectorAll('.setup-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.setup-tab-panel').forEach(p => p.classList.remove('active'));
        if (tabId) document.getElementById(tabId)?.classList.add('active');
      };
    });

    // 6. IntersectionObserver — Scroll animations
    const observerOptions = {
      threshold: 0.15,
      rootMargin: '0px 0px -40px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    document.querySelectorAll('[data-animate]').forEach(el => {
      observer.observe(el);
    });

    // 7. Stats counter animation
    const statsObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const numbers = entry.target.querySelectorAll('.stat-number[data-count]');
          numbers.forEach(num => {
            const target = parseInt(num.getAttribute('data-count') || '0');
            const prefix = num.getAttribute('data-count-prefix') || '';
            const suffix = num.getAttribute('data-count-suffix') || '';
            const duration = 1200;
            const start = performance.now();

            function animate(now: number) {
              const elapsed = now - start;
              const progress = Math.min(elapsed / duration, 1);
              const eased = 1 - Math.pow(1 - progress, 3);
              const current = Math.round(target * eased);
              num.textContent = prefix + current + suffix;
              if (progress < 1) requestAnimationFrame(animate);
            }
            requestAnimationFrame(animate);
          });
          statsObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    document.querySelectorAll('.stats-grid').forEach(el => statsObserver.observe(el));

    // 8. Custom Cursor logic — disabled on touch devices
    const cursor = document.getElementById('customCursor');

    const handleMouseMove = (e: MouseEvent) => {
      if (cursor) {
        if (cursor.style.opacity === '0' || cursor.style.opacity === '') {
          cursor.style.opacity = '1';
        }
        cursor.style.transform = `translate3d(${e.clientX - 5}px, ${e.clientY - 5}px, 0)`;
      }
    };

    const handleMouseLeave = () => {
      if (cursor) cursor.style.opacity = '0';
    };

    const handleMouseEnter = () => {
      if (cursor) cursor.style.opacity = '1';
    };

    if (cursor) {
      if (isTouchDevice) {
        cursor.style.display = 'none';
      } else {
        document.addEventListener('mousemove', handleMouseMove, { passive: true });
        document.addEventListener('mouseleave', handleMouseLeave);
        document.addEventListener('mouseenter', handleMouseEnter);
      }
    }

    // 9. Floating Cursors logic — skipped on touch devices & reduced motion
    const floatingCursors = [
      { id: 'fc-indexer', speedX: 0.0005, speedY: 0.0006, rangeX: 60, rangeY: 40, baseX: -220, baseY: -120 },
      { id: 'fc-ranker', speedX: 0.0007, speedY: 0.0004, rangeX: 70, rangeY: 50, baseX: 200, baseY: -80 },
      { id: 'fc-crawler', speedX: 0.0004, speedY: 0.0008, rangeX: 50, rangeY: 60, baseX: -180, baseY: 100 },
      { id: 'fc-auditor', speedX: 0.0006, speedY: 0.0005, rangeX: 80, rangeY: 45, baseX: 180, baseY: 110 },
    ];

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    let cursorAnimationFrame: number | null = null;
    let fcFadeTimeout: number | null = null;
    const cursors = floatingCursors.map(c => ({
      ...c,
      element: document.getElementById(c.id)
    }));

    if (cursors[0].element && !isTouchDevice && !prefersReducedMotion) {
      fcFadeTimeout = window.setTimeout(() => {
        cursors.forEach(c => {
          if (c.element) c.element.style.opacity = '1';
        });
      }, 1000);

      const animateFloatingCursors = (time: number) => {
        cursors.forEach(c => {
          if (c.element) {
            const x = c.baseX + Math.sin(time * c.speedX) * c.rangeX;
            const y = c.baseY + Math.cos(time * c.speedY) * c.rangeY;
            c.element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
          }
        });
        cursorAnimationFrame = requestAnimationFrame(animateFloatingCursors);
      };

      cursorAnimationFrame = requestAnimationFrame(animateFloatingCursors);
    } else {
      // Hide floating cursors entirely on touch / reduced-motion
      cursors.forEach(c => {
        if (c.element) c.element.style.display = 'none';
      });
    }

    // 10. GitHub card 3D tilt (desktop only)
    const ghCard = document.getElementById('ghCard');
    const ghMove = (e: MouseEvent) => {
      if (!ghCard) return;
      const rect = ghCard.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const rx = ((y - cy) / cy) * -4;
      const ry = ((x - cx) / cx) * 4;
      ghCard.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    };
    const ghLeave = () => {
      if (ghCard) {
        ghCard.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
      }
    };
    if (ghCard && !isTouchDevice) {
      ghCard.addEventListener('mousemove', ghMove);
      ghCard.addEventListener('mouseleave', ghLeave);
    }



    // 12. Chat demo typewriter loop
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const demoTimeouts: number[] = [];
    let demoInterval: number | null = null;

    const demoQueries = [
      {
        query: 'Keyword research for AI video creator',
        response: {
          highImpact: [
            { name: 'ai video creator', vol: '12,100/mo', kd: 42, kdClass: 'kd-med' },
            { name: 'ai video generator', vol: '33,100/mo', kd: 58, kdClass: 'kd-high' },
            { name: 'ai video maker', vol: '8,100/mo', kd: 35, kdClass: 'kd-med' },
          ],
          lowComp: [
            { name: 'free ai video creator', vol: '2,900/mo', kd: 22, kdClass: 'kd-low' },
            { name: 'ai video tool online', vol: '1,600/mo', kd: 18, kdClass: 'kd-low' },
          ],
          recommendation:
            '📋 Recommended: Target "ai video creator" as primary, cluster with "ai video maker" and "ai video tool"',
        },
      },
      {
        query: 'Analyze competitors for project management software',
        response: {
          highImpact: [
            { name: 'project management tool', vol: '18,100/mo', kd: 62, kdClass: 'kd-high' },
            { name: 'task management app', vol: '9,900/mo', kd: 48, kdClass: 'kd-med' },
            { name: 'team collaboration software', vol: '6,600/mo', kd: 44, kdClass: 'kd-med' },
          ],
          lowComp: [
            { name: 'simple project tracker', vol: '1,300/mo', kd: 15, kdClass: 'kd-low' },
            { name: 'free kanban board app', vol: '2,400/mo', kd: 20, kdClass: 'kd-low' },
          ],
          recommendation:
            '📋 Recommended: Target "task management app" first — lower competition with decent volume. Build authority before tackling "project management tool"',
        },
      },
    ];

    let currentQueryIndex = 0;
    let demoCancelled = false;

    const escapeHtml = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const clearChat = () => {
      if (!chatMessages || !chatInput) return;
      chatMessages.innerHTML = '';
      chatInput.innerHTML = '<span class="cursor-blink"></span>';
    };

    const typeText = (text: string, done?: () => void) => {
      if (!chatInput) return;
      let i = 0;
      chatInput.innerHTML = '';
      demoInterval = window.setInterval(() => {
        if (demoCancelled) {
          if (demoInterval) clearInterval(demoInterval);
          return;
        }
        if (i < text.length) {
          chatInput.textContent = text.substring(0, i + 1);
          i++;
        } else {
          if (demoInterval) clearInterval(demoInterval);
          if (done) demoTimeouts.push(window.setTimeout(done, 600));
        }
      }, 45);
    };

    const addUserMessage = (text: string) => {
      if (!chatMessages || !chatInput) return;
      chatInput.innerHTML = '<span class="cursor-blink"></span>';
      const msg = document.createElement('div');
      msg.className = 'chat-msg user';
      msg.textContent = text;
      chatMessages.appendChild(msg);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    };

    const showTypingIndicator = () => {
      if (!chatMessages) return;
      const indicator = document.createElement('div');
      indicator.className = 'typing-indicator';
      indicator.id = 'typingIndicator';
      indicator.innerHTML = '<span></span><span></span><span></span>';
      chatMessages.appendChild(indicator);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    };

    const removeTypingIndicator = () => {
      document.getElementById('typingIndicator')?.remove();
    };

    type DemoKw = { name: string; vol: string; kd: number; kdClass: string };
    const buildResponseHTML = (data: {
      highImpact: DemoKw[];
      lowComp: DemoKw[];
      recommendation: string;
    }) => {
      const rows = (kws: DemoKw[]) =>
        kws
          .map(
            (kw) =>
              `<div class="keyword-row"><span class="kw-name">${escapeHtml(kw.name)}</span><span class="kw-vol">${escapeHtml(kw.vol)}</span><span class="kw-diff ${kw.kdClass}">KD: ${kw.kd}</span></div>`
          )
          .join('');
      return (
        '<div class="result-header">🎯 High-Impact Keywords</div>' +
        `<div class="keyword-table">${rows(data.highImpact)}</div>` +
        '<div class="result-header" style="margin-top:16px;">🟢 Low Competition Wins</div>' +
        `<div class="keyword-table">${rows(data.lowComp)}</div>` +
        `<div class="recommendation">${escapeHtml(data.recommendation)}</div>`
      );
    };

    const showAssistantResponse = (data: (typeof demoQueries)[number]['response']) => {
      if (!chatMessages) return;
      removeTypingIndicator();
      const msg = document.createElement('div');
      msg.className = 'chat-msg assistant';
      msg.innerHTML = buildResponseHTML(data);
      msg.style.opacity = '0';
      chatMessages.appendChild(msg);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      requestAnimationFrame(() => {
        msg.style.transition = 'opacity 0.5s ease';
        msg.style.opacity = '1';
      });
    };

    const runDemoLoop = () => {
      if (demoCancelled) return;
      const demo = demoQueries[currentQueryIndex % demoQueries.length];
      currentQueryIndex++;
      clearChat();
      demoTimeouts.push(
        window.setTimeout(() => {
          typeText(demo.query, () => {
            addUserMessage(demo.query);
            demoTimeouts.push(
              window.setTimeout(() => {
                showTypingIndicator();
                demoTimeouts.push(
                  window.setTimeout(() => {
                    showAssistantResponse(demo.response);
                    demoTimeouts.push(window.setTimeout(runDemoLoop, 4000));
                  }, 1800)
                );
              }, 500)
            );
          });
        }, 1000)
      );
    };

    if (chatMessages && chatInput) {
      demoTimeouts.push(window.setTimeout(runDemoLoop, 1500));
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (ghCard) {
        ghCard.removeEventListener('mousemove', ghMove);
        ghCard.removeEventListener('mouseleave', ghLeave);
      }
      demoCancelled = true;
      demoTimeouts.forEach((t) => clearTimeout(t));
      if (demoInterval) clearInterval(demoInterval);
      if (licenseEscHandler) {
        document.removeEventListener('keydown', licenseEscHandler);
      }
      if (outsideNavClick) {
        document.removeEventListener('click', outsideNavClick);
      }
      if (mqlMobileNav && onBreakpointChange && mqlMobileNav.removeEventListener) {
        mqlMobileNav.removeEventListener('change', onBreakpointChange);
      }
      observer.disconnect();
      statsObserver.disconnect();
      if (cursor && !isTouchDevice) {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseleave', handleMouseLeave);
        document.removeEventListener('mouseenter', handleMouseEnter);
      }
      if (cursorAnimationFrame) {
        cancelAnimationFrame(cursorAnimationFrame);
      }
      if (fcFadeTimeout) {
        clearTimeout(fcFadeTimeout);
      }
    };
  }, []);

  return null;
}
