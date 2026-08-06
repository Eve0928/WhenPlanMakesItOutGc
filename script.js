(function(){

    // ---------- constants & helpers ----------
    const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa'];
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const PALETTE = ['#FF6F59','#FFC857','#4ECDC4','#B983FF','#7EC8E3','#FF8FB1','#8CE99A','#FFA94D'];

    const $ = id => document.getElementById(id);
    function pad(n){ return n<10 ? '0'+n : ''+n; }
    function isoDate(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
    function slugify(s){
        const base = s.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
        return base || ('guest' + Math.random().toString(36).slice(2,6));
    }
    function hashStr(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h*31 + s.charCodeAt(i))>>>0; } return h; }
    function colorForSlug(slug){ return PALETTE[hashStr(slug) % PALETTE.length]; }
    function shortDateLabel(iso){
        const d = new Date(iso+'T00:00:00');
        return DOW[d.getDay()] + ', ' + MONTHS[d.getMonth()].slice(0,3) + ' ' + d.getDate();
    }
    function minutesFromTime(t){ const [h,m] = t.split(':').map(Number); return h*60+m; }
    function timeLabel(mins){
        let h = Math.floor(mins/60), m = mins%60;
        const period = h < 12 ? 'AM' : 'PM';
        let hr = h % 12; if(hr===0) hr = 12;
        return hr + (m===0 ? '' : ':'+pad(m)) + ' ' + period;
    }

    const localStorePrefix = 'align:';
    function storageKey(key, shared){ return localStorePrefix + (shared ? 'shared:' : 'local:') + key; }

    async function storageGet(key, shared){
        if(window.storage && window.storage.get){
            try{ const res = await window.storage.get(key, shared); return res ? res.value : null; }
            catch(e){}
        }
        try{ return localStorage.getItem(storageKey(key, shared)); }
        catch(e){ console.warn('localStorage unavailable', e); return null; }
    }
    async function storageSet(key, value, shared){
        if(window.storage && window.storage.set){
            try{ return await window.storage.set(key, value, shared); }
            catch(e){ console.warn('Shared storage unavailable; using this browser instead.', e); }
        }
        try{
            localStorage.setItem(storageKey(key, shared), value);
            return { key };
        }catch(e){
            console.warn('localStorage unavailable', e);
            return null;
        }
    }
    async function storageList(prefix, shared){
        if(window.storage && window.storage.list){
            try{ const res = await window.storage.list(prefix, shared); return res ? res.keys : []; }
            catch(e){}
        }
        try{
            const fullPrefix = storageKey(prefix, shared);
            return Object.keys(localStorage)
            .filter(key => key.startsWith(fullPrefix))
            .map(key => key.slice((localStorePrefix + (shared ? 'shared:' : 'local:')).length));
        }catch(e){
            console.warn('localStorage unavailable', e);
            return [];
        }
    }
    async function storageDelete(key, shared){
        if(window.storage && window.storage.delete){
            try{ return await window.storage.delete(key, shared); }
            catch(e){}
        }
        try{
            localStorage.removeItem(storageKey(key, shared));
            return { key, deleted: true };
        }catch(e){
            console.warn('localStorage unavailable', e);
            return null;
        }
    }
    function resizeImageFile(file, maxW){
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, maxW / img.width);
                const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.72));
            };
            img.onerror = reject;
            img.src = reader.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // ---------- state ----------
    let calMonthHome = new Date(); calMonthHome.setDate(1);
    let selectedDatesHome = new Set();
    let coverDataHome = null;

    let myPlans = [];

    let eventCode = null, eventData = null;
    let myName = '', mySlug = '', myColor = '';
    let myEntries = new Map(); // iso -> {allDay, start, end}
    let calMonthEvent = new Date();
    let activeDetailDate = null;
    let groupTotal = 0;
    let groupDotsByDate = {};
    let groupParticipants = [];

    // ---------- generic calendar renderer ----------
    function renderMonthGrid(opts){
        const { dowEl, gridEl, labelEl, monthDate, mode, selectedSet, candidateSet, dotsByDate, total, onToggle, onDetail, activeIso } = opts;
        dowEl.innerHTML = DOW.map(d => `<div class="cal-dow">${d}</div>`).join('');
        labelEl.textContent = MONTHS[monthDate.getMonth()] + ' ' + monthDate.getFullYear();
        gridEl.innerHTML = '';

        const firstDow = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getDay();
        const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth()+1, 0).getDate();
        const today = new Date(); today.setHours(0,0,0,0);

        for(let i=0;i<firstDow;i++){ const c=document.createElement('div'); c.className='cal-day empty'; gridEl.appendChild(c); }

        for(let d=1; d<=daysInMonth; d++){
            const dateObj = new Date(monthDate.getFullYear(), monthDate.getMonth(), d);
            const iso = isoDate(dateObj);
            const cell = document.createElement('div');
            cell.className = 'cal-day';
            cell.dataset.iso = iso;
            if(dateObj.getTime() === today.getTime()) cell.classList.add('today');

            if(mode === 'free-pick'){
                cell.textContent = d;
            if(dateObj < today){ cell.classList.add('past'); }
            else{
                if(selectedSet.has(iso)) cell.classList.add('selected');
                cell.addEventListener('click', () => onToggle(iso));
            }
            } else if(mode === 'restrict-pick'){
                cell.textContent = d;
            if(!candidateSet.has(iso)){ cell.classList.add('past'); }
            else{
                cell.classList.add('candidate');
                if(selectedSet.has(iso)) cell.classList.add('selected');
                cell.addEventListener('click', () => onToggle(iso));
            }
        } else if(mode === 'view'){
            cell.classList.add('group-cell');
            if(!candidateSet.has(iso)){ cell.textContent = d; cell.classList.add('past'); }
            else{
                cell.classList.add('candidate');
                if(iso === activeIso) cell.classList.add('active-detail');
            const num = document.createElement('div'); num.className='cal-daynum'; num.textContent=d;
            cell.appendChild(num);
            const dots = dotsByDate[iso] || [];
            if(dots.length){
                const row = document.createElement('div'); row.className='dot-row';
                dots.slice(0,6).forEach(p => {
                    const dot = document.createElement('span'); dot.className='dot'; dot.style.background = p.color;
                    row.appendChild(dot);
                });
                if(dots.length>6){ const more=document.createElement('span'); more.className='dot-more'; more.textContent='+'+(dots.length-6); row.appendChild(more); }
                cell.appendChild(row);
                }
            if(total>0 && dots.length===total) cell.classList.add('full');
            cell.addEventListener('click', () => onDetail(iso));
            }
            }
            gridEl.appendChild(cell);
        }
    }

    // ---------- HOME: create calendar ----------
    function renderHomeCalendar(){
        renderMonthGrid({
            dowEl: $('cal-dow-row'), gridEl: $('cal-grid'), labelEl: $('cal-month-label'),
            monthDate: calMonthHome, mode: 'free-pick', selectedSet: selectedDatesHome,
            onToggle: (iso) => {
            if(selectedDatesHome.has(iso)) selectedDatesHome.delete(iso); else selectedDatesHome.add(iso);
            renderHomeCalendar();
            }
        });
        const n = selectedDatesHome.size;
        $('selected-count').textContent = n===0 ? 'No dates selected yet — tap any day above' : n + ' date' + (n>1?'s':'') + ' selected';

        const chipsEl = $('date-chips');
        const sorted = Array.from(selectedDatesHome).sort();
        chipsEl.innerHTML = sorted.map(iso => {
            const d = new Date(iso+'T00:00:00');
            const label = MONTHS[d.getMonth()].slice(0,3) + ' ' + d.getDate();
            return `<span class="date-chip" data-iso="${iso}">${label}<button aria-label="Remove ${label}">×</button></span>`;
        }).join('');
        chipsEl.querySelectorAll('.date-chip button').forEach(btn => {
            btn.addEventListener('click', () => { selectedDatesHome.delete(btn.parentElement.dataset.iso); renderHomeCalendar(); });
        });
    }
    $('cal-prev').addEventListener('click', () => { calMonthHome.setMonth(calMonthHome.getMonth()-1); renderHomeCalendar(); });
    $('cal-next').addEventListener('click', () => { calMonthHome.setMonth(calMonthHome.getMonth()+1); renderHomeCalendar(); });

    $('create-cover-input').addEventListener('change', async (e) => {
        const file = e.target.files[0]; if(!file) return;
        coverDataHome = await resizeImageFile(file, 480);
        $('create-cover-preview').src = coverDataHome;
    });

    // ---------- my plans (personal storage) ----------
    async function loadMyPlans(){
        const raw = await storageGet('my-plans', false);
        myPlans = raw ? JSON.parse(raw) : [];
        renderPlansGrid();
    }
    async function saveMyPlans(){ await storageSet('my-plans', JSON.stringify(myPlans), false); }
    async function upsertMyPlan(p){
        const idx = myPlans.findIndex(x => x.code === p.code);
        if(idx>=0) myPlans[idx] = Object.assign({}, myPlans[idx], p); else myPlans.unshift(p);
        await saveMyPlans();
        renderPlansGrid();
    }
    function placeholderGradient(code){
        const h = hashStr(code);
        return `linear-gradient(135deg, ${PALETTE[h%PALETTE.length]}, ${PALETTE[(h+3)%PALETTE.length]})`;
    }
    function renderPlansGrid(){
        const section = $('my-plans-section'), grid = $('plans-grid');
        if(myPlans.length === 0){ section.classList.add('hidden'); return; }
        section.classList.remove('hidden');
        grid.innerHTML = '';
        myPlans.forEach(p => {
            const card = document.createElement('div');
            card.className = 'plan-card';
            const coverHtml = p.cover
            ? `<img class="plan-cover" src="${p.cover}" alt="">`
            : `<div class="plan-cover" style="background:${placeholderGradient(p.code)};"></div>`;
            card.innerHTML = coverHtml + `<div class="plan-card-body">
                <div class="plan-name">${p.name}</div>
                <div class="plan-meta">${p.code}</div>
                <button class="plan-delete-btn" aria-label="Delete plan" title="Delete this plan">×</button>
            </div>`;
            card.addEventListener('click', () => openPlanByCode(p.code));
            card.querySelector('.plan-delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                confirmAndDeletePlan(p.code, p.name, e.currentTarget);
            });
            grid.appendChild(card);
        });
    }
    async function deletePlan(code){
        // Remove the shared plan + everyone's saved availability from Firestore
        await storageDelete('event:' + code, true);
        const availKeys = await storageList('avail:' + code + ':', true);
        for(const key of availKeys){ await storageDelete(key, true); }
        // Remove it from this browser's own plan list
        myPlans = myPlans.filter(p => p.code !== code);
        await saveMyPlans();
        renderPlansGrid();
    }
    function confirmAndDeletePlan(code, name, triggerEl){
        const ok = confirm(`Delete "${name}"? This removes it — and everyone's saved availability for it — permanently.`);
        if(!ok) return;
        if(triggerEl){ triggerEl.disabled = true; triggerEl.textContent = triggerEl.textContent === '×' ? '…' : 'Deleting…'; }
        deletePlan(code)
            .then(() => {
                if(eventCode === code){ $('btn-back-home').click(); }
            })
            .catch((e) => {
                console.error('Delete plan failed', e);
                alert("Couldn't delete the plan — check the browser console for details, or check your internet connection.");
            })
            .finally(() => {
                if(triggerEl){ triggerEl.disabled = false; }
            });
    }
    async function openPlanByCode(code){
        const raw = await storageGet('event:' + code, true);
        if(!raw) return;
        eventData = JSON.parse(raw); eventCode = code;
        enterEventScreen();
    }

    // ---------- create / join ----------
    $('btn-create').addEventListener('click', async () => {
        const errEl = $('create-error'); errEl.classList.add('hidden');
        const name = $('event-name').value.trim();
        if(!name){ errEl.textContent='Give your plan a name.'; errEl.classList.remove('hidden'); return; }
        if(selectedDatesHome.size === 0){ errEl.textContent='Pick at least one date.'; errEl.classList.remove('hidden'); return; }

        const btn = $('btn-create'); btn.disabled = true; btn.textContent = 'Creating…';
        try{
            const code = (() => { const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let o=''; for(let i=0;i<5;i++) o+=chars[Math.floor(Math.random()*chars.length)]; return o; })();
            const data = { name, dates: Array.from(selectedDatesHome).sort(), cover: coverDataHome, createdAt: Date.now() };
            const res = await storageSet('event:' + code, JSON.stringify(data), true);
            if(!res){ errEl.textContent="Couldn't create the plan — try again."; errEl.classList.remove('hidden'); return; }

            eventCode = code; eventData = data;
            await upsertMyPlan({ code, name: data.name, cover: data.cover });
            enterEventScreen();
        }catch(e){
            console.error('Create plan failed', e);
            errEl.textContent = "Something went wrong creating the plan: " + e.message;
            errEl.classList.remove('hidden');
        }finally{
            btn.disabled = false; btn.textContent = 'Create plan';
        }
    });

    $('btn-join').addEventListener('click', async () => {
        const errEl = $('join-error'); errEl.classList.add('hidden');
        const code = $('join-code').value.trim().toUpperCase();
        if(!code){ errEl.textContent='Enter a code.'; errEl.classList.remove('hidden'); return; }
        const raw = await storageGet('event:' + code, true);
        if(!raw){ errEl.textContent="Couldn't find a plan with that code."; errEl.classList.remove('hidden'); return; }
        eventData = JSON.parse(raw); eventCode = code;
        await upsertMyPlan({ code, name: eventData.name, cover: eventData.cover });
        enterEventScreen();
    });

    $('btn-back-home').addEventListener('click', () => {
        eventCode=null; eventData=null; myName=''; mySlug=''; myEntries=new Map(); activeDetailDate=null;
        $('screen-event').classList.add('hidden');
        $('screen-home').classList.remove('hidden');
        $('name-gate').classList.remove('hidden');
        $('event-body').classList.add('hidden');
        $('my-name').value = '';
        renderPlansGrid();
    });

    // ---------- event screen ----------
    function enterEventScreen(){
        $('screen-home').classList.add('hidden');
        $('screen-event').classList.remove('hidden');
        $('ev-name').textContent = eventData.name;
        $('ev-code').textContent = eventCode;
        const n = eventData.dates.length;
        $('ev-meta').textContent = n + ' candidate date' + (n>1?'s':'') + ' · ' + eventData.dates[0] + (n>1 ? ' to ' + eventData.dates[n-1] : '');

        const banner = $('ev-cover-banner');
        if(eventData.cover){ banner.src = eventData.cover; banner.classList.remove('hidden'); }
        else { banner.classList.add('hidden'); }

        $('name-gate').classList.remove('hidden');
        $('event-body').classList.add('hidden');
        $('my-name').value = '';

        const firstDate = new Date(eventData.dates[0] + 'T00:00:00');
        calMonthEvent = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
        activeDetailDate = null;
        switchTab('mine');
    }

    $('btn-copy-code').addEventListener('click', () => {
        navigator.clipboard.writeText(eventCode).then(() => {
            const b = $('btn-copy-code'); const old = b.textContent;
            b.textContent = 'copied!'; setTimeout(() => b.textContent = old, 1200);
        });
    });

    $('btn-delete-plan').addEventListener('click', (e) => {
        confirmAndDeletePlan(eventCode, eventData.name, e.currentTarget);
    });

    $('ev-cover-input').addEventListener('change', async (e) => {
        const file = e.target.files[0]; if(!file) return;
        const dataUrl = await resizeImageFile(file, 640);
        eventData.cover = dataUrl;
        await storageSet('event:' + eventCode, JSON.stringify(eventData), true);
        await upsertMyPlan({ code: eventCode, name: eventData.name, cover: dataUrl });
        const banner = $('ev-cover-banner');
        banner.src = dataUrl; banner.classList.remove('hidden');
    });

    $('btn-set-name').addEventListener('click', async () => {
        const val = $('my-name').value.trim();
        if(!val) return;
        myName = val; mySlug = slugify(myName); myColor = colorForSlug(mySlug);
        $('name-gate').classList.add('hidden');
        $('event-body').classList.remove('hidden');
        $('mine-name-echo').textContent = myName;
        $('mine-name-echo').style.color = myColor;

        const raw = await storageGet('avail:' + eventCode + ':' + mySlug, true);
        myEntries = new Map();
        if(raw){
            try{
            const parsed = JSON.parse(raw);
            (parsed.entries || []).forEach(e => myEntries.set(e.date, { allDay: e.allDay, start: e.start, end: e.end }));
            }catch(err){}
        }
        renderMineCalendar();
        renderMineDateList();
    });

    // tabs
    $('tab-mine').addEventListener('click', () => switchTab('mine'));
    $('tab-group').addEventListener('click', () => switchTab('group'));
    function switchTab(which){
        $('tab-mine').classList.toggle('active', which==='mine');
        $('tab-group').classList.toggle('active', which==='group');
        $('panel-mine').classList.toggle('hidden', which!=='mine');
        $('panel-group').classList.toggle('hidden', which!=='group');
        if(which==='mine' && myName) renderMineCalendar();
        if(which==='group') buildGroupView();
    }

    // ---------- my availability ----------
    function renderMineCalendar(){
        const candidateSet = new Set(eventData.dates);
        renderMonthGrid({
            dowEl: $('mine-dow-row'), gridEl: $('mine-grid'), labelEl: $('ev-cal-month-label'),
            monthDate: calMonthEvent, mode: 'restrict-pick',
            selectedSet: new Set(myEntries.keys()), candidateSet,
            onToggle: (iso) => {
            if(myEntries.has(iso)) myEntries.delete(iso);
            else myEntries.set(iso, { allDay: true, start: '09:00', end: '21:00' });
            renderMineCalendar();
            renderMineDateList();
            }
        });
    }
    $('ev-cal-prev').addEventListener('click', () => { calMonthEvent.setMonth(calMonthEvent.getMonth()-1); renderMineCalendar(); });
    $('ev-cal-next').addEventListener('click', () => { calMonthEvent.setMonth(calMonthEvent.getMonth()+1); renderMineCalendar(); });

    function renderMineDateList(){
        const listEl = $('mine-date-list');
        const isoList = Array.from(myEntries.keys()).sort();
        if(isoList.length === 0){ listEl.innerHTML = '<p class="hint">No dates selected yet — tap dates on the calendar above.</p>'; return; }

        listEl.innerHTML = isoList.map(iso => {
        const e = myEntries.get(iso);
        return `<div class="date-row" data-iso="${iso}">
            <span class="swatch" style="background:${myColor};"></span>
            <span class="dlabel">${shortDateLabel(iso)}</span>
            <label class="allday-toggle"><input type="checkbox" class="allday-cb" ${e.allDay?'checked':''}> All day</label>
            <span class="time-inputs ${e.allDay?'hidden':''}">
                <input type="time" class="start-time" value="${e.start}">–
                <input type="time" class="end-time" value="${e.end}">
            </span>
            <button class="remove-btn" aria-label="Remove">×</button>
            </div>`;
        }).join('');

        listEl.querySelectorAll('.date-row').forEach(row => {
            const iso = row.dataset.iso;
            row.querySelector('.allday-cb').addEventListener('change', (e) => {
            const entry = myEntries.get(iso); entry.allDay = e.target.checked;
            row.querySelector('.time-inputs').classList.toggle('hidden', entry.allDay);
            });
            row.querySelector('.start-time').addEventListener('change', (e) => { myEntries.get(iso).start = e.target.value; });
            row.querySelector('.end-time').addEventListener('change', (e) => { myEntries.get(iso).end = e.target.value; });
            row.querySelector('.remove-btn').addEventListener('click', () => {
            myEntries.delete(iso); renderMineCalendar(); renderMineDateList();
            });
        });
    }

    $('btn-save').addEventListener('click', async () => {
        const status = $('save-status');
        status.textContent = 'Saving…';
        const entries = Array.from(myEntries.entries()).map(([date, e]) => ({ date, allDay: e.allDay, start: e.start, end: e.end }));
        const payload = JSON.stringify({ name: myName, color: myColor, entries });
        const res = await storageSet('avail:' + eventCode + ':' + mySlug, payload, true);
        status.textContent = res ? 'Saved ✓' : "Couldn't save — try again";
        setTimeout(() => { status.textContent = ''; }, 2500);
    });

    // ---------- group view ----------
    function computeCommonWindow(entries){
        let maxStart = 0, minEnd = 1440;
        entries.forEach(e => {
            const s = e.allDay ? 0 : minutesFromTime(e.start);
            const en = e.allDay ? 1440 : minutesFromTime(e.end);
            maxStart = Math.max(maxStart, s); minEnd = Math.min(minEnd, en);
        });
        if(maxStart >= minEnd) return null;
        if(maxStart===0 && minEnd===1440) return 'All day';
        return timeLabel(maxStart) + ' – ' + timeLabel(minEnd);
    }

    async function buildGroupView(){
        const grid = $('grp-grid');
        grid.innerHTML = '<p class="hint">Loading everyone\'s availability…</p>';

        const keys = await storageList('avail:' + eventCode + ':', true);
        groupParticipants = [];
        for(const key of keys){
            const raw = await storageGet(key, true);
            if(raw){ try{ groupParticipants.push(JSON.parse(raw)); }catch(e){} }
        }
        groupTotal = groupParticipants.length;

        groupDotsByDate = {};
        const entriesByDate = {};
        groupParticipants.forEach(p => {
            (p.entries || []).forEach(e => {
            if(!groupDotsByDate[e.date]) groupDotsByDate[e.date] = [];
            groupDotsByDate[e.date].push({ name: p.name, color: p.color || colorForSlug(slugify(p.name)) });
            if(!entriesByDate[e.date]) entriesByDate[e.date] = [];
            entriesByDate[e.date].push(Object.assign({ name: p.name, color: p.color }, e));
            });
        });

        const candidateSet = new Set(eventData.dates);

        if(groupTotal === 0){
            grid.innerHTML = '';
            renderMonthGrid({
            dowEl: $('grp-dow-row'), gridEl: grid, labelEl: $('grp-cal-month-label'),
            monthDate: calMonthEvent, mode: 'view', candidateSet, dotsByDate: {}, total: 0,
            onDetail: () => {}, activeIso: null
            });
            $('legend').innerHTML = '<p class="hint">Nobody has marked their availability yet. Share the code and check back!</p>';
            $('best-times-list').innerHTML = '';
            $('detail-panel').classList.add('hidden');
            return;
        }

        renderMonthGrid({
            dowEl: $('grp-dow-row'), gridEl: grid, labelEl: $('grp-cal-month-label'),
            monthDate: calMonthEvent, mode: 'view', candidateSet, dotsByDate: groupDotsByDate, total: groupTotal,
            onDetail: (iso) => { activeDetailDate = iso; showDetail(iso, entriesByDate[iso] || []); buildGroupView(); },
            activeIso: activeDetailDate
        });

        $('legend').innerHTML = groupParticipants.map(p =>
            `<span class="legend-person"><span class="swatch" style="background:${p.color};"></span>${p.name}</span>`
        ).join('');

        if(activeDetailDate){ showDetail(activeDetailDate, entriesByDate[activeDetailDate] || []); }
        else { $('detail-panel').classList.add('hidden'); }

        const ranked = Object.entries(entriesByDate)
            .map(([iso, entries]) => ({ iso, entries, count: entries.length, window: computeCommonWindow(entries) }))
            .sort((a,b) => b.count - a.count)
            .slice(0, 6);

        const list = $('best-times-list');
        if(ranked.length === 0){
            list.innerHTML = '<p class="hint">No overlap yet — check back once more people respond.</p>';
        } else {
            list.innerHTML = ranked.map(r => `<div class="best-row">
                <span>${shortDateLabel(r.iso)}</span>
                <span class="dots">${r.entries.map(e => `<span class="dot" style="background:${e.color}; width:8px; height:8px; display:inline-block; border-radius:50%;"></span>`).join('')}</span>
                <span class="win">${r.window ? r.window : 'times vary'}</span>
                <span class="count">${r.count}/${groupTotal}</span>
            </div>`).join('');
        }
    }

    function showDetail(iso, entries){
        const panel = $('detail-panel');
        if(!entries || entries.length === 0){ panel.classList.add('hidden'); return; }
        panel.classList.remove('hidden');
        const rows = entries.map(e => {
            const t = e.allDay ? 'All day' : (timeLabel(minutesFromTime(e.start)) + ' – ' + timeLabel(minutesFromTime(e.end)));
            return `<div class="detail-row"><span class="swatch" style="background:${e.color};"></span>${e.name}<span class="t">${t}</span></div>`;
        }).join('');
        const win = computeCommonWindow(entries);
        panel.innerHTML = `<h4>${shortDateLabel(iso)}</h4>${rows}` + (win ? `<div class="common-window">✦ Everyone here overlaps: ${win}</div>` : '');
    }

    $('grp-cal-prev').addEventListener('click', () => { calMonthEvent.setMonth(calMonthEvent.getMonth()-1); buildGroupView(); });
    $('grp-cal-next').addEventListener('click', () => { calMonthEvent.setMonth(calMonthEvent.getMonth()+1); buildGroupView(); });

    // ---------- init ----------
    renderHomeCalendar();
    loadMyPlans();

})();