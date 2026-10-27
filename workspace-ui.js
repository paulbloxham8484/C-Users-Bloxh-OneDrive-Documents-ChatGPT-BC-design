// View-only workspace organisation. No project data or history is stored here.
(function initWorkspaceUi() {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function' || window.BCWorkspace) return;
  const $ = selector => document.querySelector(selector);
  const make = (tag, className, text) => { const el=document.createElement(tag); el.className=className||''; if(text)el.textContent=text; return el; };
  const button = (text, action, title=text) => { const el=make('button','workspace-button',text);el.type='button';el.title=title;el.addEventListener('click',action);return el; };
  const root=$('.workspace'), rail=$('.tool-rail'), inspector=$('.inspector');
  if (!root || !rail || !inspector) return;
  let leftTab='build',rightTab='properties',lastSelection='',lastMode=state.mode,lastRooms='';
  const mobile=()=>matchMedia('(max-width: 900px)').matches;
  const panels={};
  function tabs(container, names, side) {
    const bar=make('div','workspace-tabs');bar.setAttribute('role','tablist');bar.setAttribute('aria-label',side==='left'?'Drawing controls':'Inspector panels');
    for(const [key,label] of names){
      const panel=make('div','workspace-panel');panel.id=`workspace-${key}`;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',`workspace-tab-${key}`);panels[key]=panel;
      const tab=button(label,()=>showTab(side,key));tab.id=`workspace-tab-${key}`;tab.dataset.workspaceTab=key;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',panel.id);
      tab.addEventListener('keydown',e=>{const keys=names.map(n=>n[0]),i=keys.indexOf(key);let next;if(e.key==='ArrowRight')next=keys[(i+1)%keys.length];if(e.key==='ArrowLeft')next=keys[(i+keys.length-1)%keys.length];if(e.key==='Home')next=keys[0];if(e.key==='End')next=keys.at(-1);if(next){e.preventDefault();showTab(side,next);$(`#workspace-tab-${next}`).focus();}});
      bar.append(tab);container.append(panel);
    }container.prepend(bar);
  }
  const oldRail=Array.from(rail.children||[]),oldInspector=Array.from(inspector.children||[]);
  tabs(rail,[['build','Build'],['layers','Layers'],['rooms','Rooms']],'left');
  tabs(inspector,[['properties','Properties'],['schedules','Schedules'],['project','Project']],'right');
  function showTab(side,key) {
    if(side==='left')leftTab=key;else rightTab=key;
    const container=side==='left'?rail:inspector;
    container.querySelectorAll(':scope > .workspace-panel').forEach(el=>el.hidden=el!==panels[key]);
    container.querySelectorAll('[data-workspace-tab]').forEach(el=>{const active=el.dataset.workspaceTab===key;el.setAttribute('aria-selected',active);el.tabIndex=active?0:-1;});
    if(mobile()){root.dataset.drawer=side;root.classList.remove('workspace-focus');}
  }
  const toolGroups=[['Edit & navigate',['select','pan']],['Architecture',['wall','door','window','floor','room','stair','roof','deck']],['Structure',['foundation','pad','pier']],['Services',['service','service-route','service-fitting','service-fixture']],['Annotate',['dimension','note']]];
  for(const [label,tools] of toolGroups){const group=make('section','build-tool-group');group.append(make('h3','rail-heading',label));const grid=make('div','build-tool-grid');for(const tool of tools){const el=$(`[data-tool="${tool}"]`);if(el)grid.append(el);}group.append(grid);panels.build.append(group);}
  const measurements=make('section','build-measurement');
  for(const child of oldRail){if(child.matches('.field-label,.input-with-unit,.tool-help'))measurements.append(child);}
  panels.build.append(measurements);
  const footer=make('div','workspace-rail-footer');footer.append($('#loadExampleButton'));rail.append(footer);
  const layerPanel=$('.layer-panel');panels.layers.append(layerPanel);
  for(const child of oldRail)if(child.parentElement===rail)child.remove();
  const search=(id,label,placeholder,parent)=>{const wrap=make('label','workspace-search',label);const input=make('input');input.id=id;input.type='search';input.placeholder=placeholder;wrap.append(input);parent.prepend(wrap);return input;};
  const layerSearch=search('layerSearch','Find a layer','e.g. walls, water, roof',panels.layers);
  const layerGroups=[];
  for(const [label,match] of [['Architecture',k=>['walls','openings','rooms','floors','floorOpenings','kitchen','dimensions','planSizes','notes'].includes(k)],['Site',k=>k==='siteConcepts'],['Roof & framing',k=>/roof/i.test(k)||k==='joinedRoofs'],['Foundations & floor',k=>['foundationSetout','foundations','pads','piers','reinforcement','floorFraming'].includes(k)],['Stairs & rails',k=>/^stair/.test(k)],['Deck & veranda',k=>/^deck/.test(k)||k==='barriers']]){
    const group=make('details','workspace-layer-group');group.open=label==='Architecture';const summary=make('summary','',label);const count=make('span','layer-count');summary.append(count);group.append(summary);
    for(const row of [...layerPanel.querySelectorAll(':scope > .layer-toggle')])if(match(row.querySelector('input').dataset.layer))group.append(row);
    layerPanel.insertBefore(group,layerPanel.children[1]);layerGroups.push(group);
  }
  layerGroups.reverse().forEach(group=>layerPanel.insertBefore(group,layerPanel.children[1]));
  for(const group of layerPanel.querySelectorAll(':scope > details'))if(!layerGroups.includes(group)){group.classList.add('workspace-layer-group');group.open=false;layerGroups.push(group);}
  const layerEmpty=make('p','workspace-empty','No matching layers. Try another name.');layerEmpty.hidden=true;panels.layers.append(layerEmpty);
  let layerOpenBeforeSearch=null;
  layerSearch.addEventListener('input',()=>{const q=layerSearch.value.trim().toLowerCase();if(q&&!layerOpenBeforeSearch)layerOpenBeforeSearch=layerGroups.map(g=>g.open);let hits=0;layerGroups.forEach((group,i)=>{const groupMatch=group.querySelector('summary').textContent.toLowerCase().includes(q);const rows=[...group.querySelectorAll('.layer-toggle')];let count=0;for(const row of rows){row.hidden=!!q&&!groupMatch&&!row.textContent.toLowerCase().includes(q);if(!row.hidden)count++;}group.hidden=!!q&&!(groupMatch||count);if(!group.hidden)hits++;group.open=q?!group.hidden:(layerOpenBeforeSearch?.[i]??group.open);});for(const row of layerPanel.querySelectorAll(':scope > .layer-toggle')){row.hidden=!!q&&!row.textContent.toLowerCase().includes(q);if(!row.hidden)hits++;}layerEmpty.hidden=hits>0;if(!q)layerOpenBeforeSearch=null;});
  const projectIds=['endCutButton','connectorDetailsButton','stockPlanningButton','levelDatumEditor','materialReferenceList','specificationList','specificationLibraryExport','linkedSpecificationSchedule','groupedSpecificationEstimates','complianceList','disciplinePlanList'];
  for(const section of oldInspector){if(section.matches('.inspector-head,#selectionSection'))panels.properties.append(section);else if(projectIds.some(id=>section.querySelector(`#${id}`)))panels.project.append(section);else panels.schedules.append(section);}
  const scheduleSections=[...panels.schedules.children];
  const scheduleSearch=search('scheduleSearch','Find a schedule','e.g. kitchen, framing, services',panels.schedules);
  const scheduleEmpty=make('p','workspace-empty','No matching schedules. Try another name.');scheduleEmpty.hidden=true;panels.schedules.append(scheduleEmpty);
  function filterSchedules(){const q=scheduleSearch.value.trim().toLowerCase();let count=0;for(const section of scheduleSections){section.hidden=!!q&&!section.querySelector('h3')?.textContent.toLowerCase().includes(q);if(!section.hidden)count++;}scheduleEmpty.hidden=count>0;}
  scheduleSearch.addEventListener('input',filterSchedules);
  function revealSchedule(id){scheduleSearch.value='';filterSchedules();showTab('right','schedules');const section=$(`#${id}`)?.closest('section');if(section){section.querySelectorAll('details').forEach(d=>d.open=true);section.scrollIntoView({block:'start'});}}
  const roomSearch=search('roomSearch','Find a room','Search rooms on this level',panels.rooms),roomList=make('div','workspace-room-list');panels.rooms.append(roomList);
  function renderRooms(){const rooms=state.model.rooms.filter(r=>r.levelId===state.model.activeLevelId),q=roomSearch.value.trim().toLowerCase();roomList.replaceChildren();for(const room of rooms.filter(r=>r.name.toLowerCase().includes(q))){const el=button(room.name,()=>focusRoom(room));el.classList.add('workspace-room');const size=make('small','',`${formatArea(polygonArea(room.points))} · ${room.use||'Room'}`);el.append(size);roomList.append(el);}if(!roomList.childElementCount)roomList.append(make('p','workspace-empty',rooms.length?'No matching rooms.':'Draw a room or load the example house.'));}
  function focusRoom(room){kitchenPlan();state.selected={type:'room',id:room.id};state.tool='select';if(mobile())delete root.dataset.drawer;const xs=room.points.map(p=>p.x),ys=room.points.map(p=>p.y),minX=Math.min(...xs)-900,maxX=Math.max(...xs)+900,minY=Math.min(...ys)-900,maxY=Math.max(...ys)+900;state.view.scale=clamp(Math.min((state.width-80)/(maxX-minX),(state.height-80)/(maxY-minY)),.025,1.2);state.view.offsetX=state.width/2-(minX+maxX)/2*state.view.scale;state.view.offsetY=state.height/2-(minY+maxY)/2*state.view.scale;render();if(mobile())delete root.dataset.drawer;}
  roomSearch.addEventListener('input',renderRooms);
  // Existing buttons retain IDs and handlers when moved into the streamlined navigation.
  const topActions=$('.top-actions');
  const exports=make('details','workspace-menu');exports.append(make('summary','','Export drawings'));const exportBody=make('div','workspace-menu-body');exports.append(exportBody);topActions.append(exports);
  const exportButtons=['planSheetButton','siteSheetButton','sheetSetButton','layoutSheetsButton','sheetButton','csvButton'].map(id=>$(`#${id}`)).filter(Boolean);
  for(const child of exportButtons)exportBody.append(child);
  const review=make('details','workspace-menu');review.append(make('summary','','Review tools'));const reviewBody=make('div','workspace-menu-body');review.append(reviewBody);$('.modebar').append(review);
  for(const id of ['wetAreasTab','energyEfficiencyTab']){const el=$(`#${id}`);el.removeAttribute('role');el.removeAttribute('aria-selected');reviewBody.append(el);}
  const toolbar=make('div','drawing-toolbar');$('.modebar').after(toolbar);const shortcuts=make('div','drawing-presets');toolbar.append(shortcuts);
  const clarity=make('div','plan-clarity');clarity.innerHTML='<span class="plan-clarity-title">Plan clarity</span><label class="plan-clarity-field" for="planDisplayMode"><span class="sr-only">Plan display</span><select id="planDisplayMode" aria-label="Plan display"><option value="readable">Readable plan</option><option value="coordination">Coordination plan</option></select></label><label class="plan-clarity-grid"><input id="planGridToggle" type="checkbox"><span>Grid</span></label><span class="plan-clarity-hint" id="planClarityHint">Architectural layers emphasised</span>';toolbar.append(clarity);
  const displaySelect=clarity.querySelector('#planDisplayMode'),gridToggle=clarity.querySelector('#planGridToggle'),clarityHint=clarity.querySelector('#planClarityHint');
  function syncPlanClarity(){displaySelect.value=state.planDisplayMode;gridToggle.checked=state.planGridVisible;clarityHint.textContent=state.planDisplayMode==='readable'?'Architectural layers emphasised':'All active review layers visible';}
  displaySelect.addEventListener('change',()=>{state.planDisplayMode=displaySelect.value;state.view.initialized=false;if(state.mode==='plan')fitView();render();});
  gridToggle.addEventListener('change',()=>{state.planGridVisible=gridToggle.checked;render();});
  for(const id of ['interiorPlanButton','exteriorViewButton','siteWalkthroughButton','foundationViewButton','kitchenButton','elevationsButton'])shortcuts.append($(`#${id}`));
  for(const id of ['wetAreasButton','energyEfficiencyButton']){const el=$(`#${id}`);el.hidden=true;reviewBody.append(el);}
  const actions=$('.mode-actions');toolbar.append(actions);actions.append(button('Focus',()=>{root.classList.toggle('workspace-focus');delete root.dataset.drawer;syncFocus();},'Toggle a larger drawing area'));actions.lastChild.id='focusWorkspaceButton';
  const mobileBar=make('div','workspace-mobile-actions');for(const [label,side,key] of [['Tools','left','build'],['Layers','left','layers'],['Rooms','left','rooms'],['Properties','right','properties'],['Schedules','right','schedules']])mobileBar.append(button(label,()=>{if(root.dataset.drawer===side&&(side==='left'?leftTab:rightTab)===key)delete root.dataset.drawer;else showTab(side,key);}));toolbar.after(mobileBar);
  for(const container of [rail,inspector]){const close=button('Close panel',()=>{delete root.dataset.drawer;});close.classList.add('workspace-close-panel');container.querySelector('.workspace-tabs').after(close);}
  const zoom=make('div','workspace-zoom');zoom.append(button('−',()=>zoomAt(1/1.2,state.width/2,state.height/2),'Zoom out'),button('Fit',()=>{fitView();render();},'Fit drawing'),button('+',()=>zoomAt(1.2,state.width/2,state.height/2),'Zoom in'));$('.canvas-shell').append(zoom);
  function syncFocus(){$('#focusWorkspaceButton').textContent=root.classList.contains('workspace-focus')?'Show panels':'Focus';$('#focusWorkspaceButton').setAttribute('aria-pressed',root.classList.contains('workspace-focus'));}
  document.addEventListener('click',event=>{for(const menu of [exports,review])if(!menu.contains(event.target)||event.target.closest('button'))menu.open=false;const tool=event.target.closest('[data-tool]');if(tool&&mobile())delete root.dataset.drawer;if(event.target.closest('#kitchenButton'))revealSchedule('kitchenPlace');});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){delete root.dataset.drawer;exports.open=false;review.open=false;}});
  function sync(){
    const selection=state.selected?`${state.selected.type}:${state.selected.id}`:'';
    if(selection&&selection!==lastSelection){showTab('right','properties');panels.properties.scrollTop=0;}lastSelection=selection;
    if(state.mode==='quantities'&&lastMode!=='quantities')revealSchedule('quantityCards');lastMode=state.mode;
    const rooms=JSON.stringify(state.model.rooms.filter(r=>r.levelId===state.model.activeLevelId).map(r=>[r.id,r.name,r.use,r.points]));if(rooms!==lastRooms){lastRooms=rooms;renderRooms();}
    for(const group of layerGroups){const count=group.querySelector('.layer-count');if(count){const rows=[...group.querySelectorAll('[data-layer]')];count.textContent=`${rows.filter(c=>c.checked).length}/${rows.length}`;}}
    $('#modelStatus').title=$('#modelStatus').textContent;syncPlanClarity();
  }
  window.BCWorkspace={sync,showTab,revealSchedule};
  document.body.classList.add('workspace-ready');showTab('left','build');showTab('right','properties');delete root.dataset.drawer;syncFocus();sync();
  // Panel reflow changes available pixels, never the saved geometry or zoom anchor.
  let previousSize='';new ResizeObserver(()=>{const size=`${canvasShell.clientWidth},${canvasShell.clientHeight}`;if(size===previousSize)return;const previousWidth=state.width,previousHeight=state.height;previousSize=size;resizeCanvas();if(previousWidth!==state.width||previousHeight!==state.height){if(state.mode!=='3d'){state.view.offsetX+=(state.width-previousWidth)/2;state.view.offsetY+=(state.height-previousHeight)/2;}render();}}).observe(canvasShell);
})();
