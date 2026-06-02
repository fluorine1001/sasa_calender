// js/rich-editor.js
export class NoticeEditor {
    static activeInstance = null;

    constructor(containerId, latexGuide, callbacks) {
        this.container = document.getElementById(containerId);
        this.latexGuide = latexGuide;
        this.callbacks = callbacks;
        this.quill = null;
        this.isHtmlMode = false; // 💡 HTML 편집 모드 상태 플래그 추가
        
        // 💡 Cloudinary 설정 (이미지/비디오 공용 업로드를 위해 auto 사용)
        this.cloudinaryUrl = "https://api.cloudinary.com/v1_1/djryl7blo/auto/upload"; 
        this.uploadPreset = "SASAcalender"; 

        // 통합 미디어 모달 상태 관리
        this.modalState = {
            mode: 'upload',     // 'upload' | 'edit'
            type: 'image',      // 'image' | 'video'
            source: 'file',     // 'file' | 'url'
            file: null,
            targetNode: null,
            ratio: 1
        };

        this.renderGlobalUI();
        this.renderUI();
        this.initQuill();
        this.initEvents();
    }

    // 📌 전역 UI 및 필수 CSS (통합 모달창, 우클릭 메뉴)
    renderGlobalUI() {
        if (!document.getElementById('quill-custom-media-ui')) {
            // 💡 에디터 내 동영상(iframe) 클릭 방해 차단 및 커스텀 폰트/크기/줄간격 드롭다운 UI CSS 주입
            const style = document.createElement('style');
            style.innerHTML = `
                .ql-editor iframe, .ql-editor video {
                    pointer-events: none !important; 
                }
                .ql-editor img {
                    cursor: context-menu;
                }
                #quill-media-context-menu div:hover {
                    background-color: #f8fafc !important;
                }

                /* 💡 커스텀 툴바 드롭다운 라벨링 (크기, 글꼴, 줄간격) */
                .ql-snow .ql-picker.ql-size { width: 75px; }
                .ql-snow .ql-picker.ql-size .ql-picker-label::before { content: '크기'; }
                .ql-snow .ql-picker.ql-size .ql-picker-item::before { content: '기본 (14px)'; }
                .ql-snow .ql-picker.ql-size .ql-picker-label[data-value]::before,
                .ql-snow .ql-picker.ql-size .ql-picker-item[data-value]::before { content: attr(data-value) !important; }
                
                .ql-snow .ql-picker.ql-font { width: 95px; }
                .ql-snow .ql-picker.ql-font .ql-picker-label::before { content: '글꼴'; }
                .ql-snow .ql-picker.ql-font .ql-picker-item::before { content: '기본 서체'; }
                .ql-snow .ql-picker.ql-font .ql-picker-label[data-value]::before,
                .ql-snow .ql-picker.ql-font .ql-picker-item[data-value]::before { content: attr(data-value) !important; font-family: attr(data-value); }

                .ql-snow .ql-picker.ql-line-height { width: 85px; }
                .ql-snow .ql-picker.ql-line-height .ql-picker-label::before { content: '줄 간격'; }
                .ql-snow .ql-picker.ql-line-height .ql-picker-item::before { content: '기본 (1.5)'; }
                .ql-snow .ql-picker.ql-line-height .ql-picker-label[data-value]::before,
                .ql-snow .ql-picker.ql-line-height .ql-picker-item[data-value]::before { content: attr(data-value) !important; }
            `;
            document.head.appendChild(style);

            const uiWrapper = document.createElement('div');
            uiWrapper.id = 'quill-custom-media-ui';
            uiWrapper.innerHTML = `
                <div id="quill-media-context-menu" style="display:none; position:fixed; background:#fff; border:1px solid #e2e8f0; box-shadow: 0 10px 15px rgba(0,0,0,0.1); border-radius:8px; z-index:10000; font-size:13px; min-width:140px; overflow:hidden;">
                    <div id="menu-item-edit-media" style="padding:12px 16px; cursor:pointer; color:#334155; font-weight:500; transition: background 0.2s;">⚙️ 미디어 크기 변경</div>
                    <div id="menu-item-delete-media" style="padding:12px 16px; cursor:pointer; color:#ef4444; font-weight:600; border-top: 1px solid #f1f5f9; transition: background 0.2s;">🗑️ 미디어 완전 삭제</div>
                </div>

                <div id="quill-media-modal" style="display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.4); z-index:10001; align-items:center; justify-content:center; font-family:sans-serif;">
                    <div style="background:#fff; padding:24px; border-radius:12px; width:320px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
                        <h4 style="margin:0 0 15px 0; color:#1a73e8; font-size: 16px; text-align:center;" id="media-modal-title">🖼️ 미디어 설정</h4>
                        
                        <div id="media-modal-tab-bar" style="display:flex; background:#f1f3f4; padding:4px; border-radius:8px; margin-bottom:16px;">
                            <button type="button" id="tab-btn-file" style="flex:1; border:none; padding:8px; font-size:13px; font-weight:bold; border-radius:6px; cursor:pointer; background:#fff; color:#1a73e8; transition:all 0.2s;">📁 파일 업로드</button>
                            <button type="button" id="tab-btn-url" style="flex:1; border:none; padding:8px; font-size:13px; font-weight:bold; border-radius:6px; cursor:pointer; background:transparent; color:#5f6368; transition:all 0.2s;">🔗 웹 링크 입력</button>
                        </div>

                        <div id="media-modal-file-wrapper" style="margin-bottom: 16px;">
                            <label style="font-size:12px; color:#666; display:block; margin-bottom:6px; font-weight:bold;">로컬 파일 선택</label>
                            <input type="file" id="media-modal-file-input" style="font-size:12px; width:100%; border:1px solid #ddd; padding:6px; border-radius:6px; background:#fafafa; box-sizing:border-box;">
                        </div>

                        <div id="media-modal-url-wrapper" style="margin-bottom: 16px; display:none;">
                            <label style="font-size:12px; color:#666; display:block; margin-bottom:6px; font-weight:bold;">인터넷 주소 (URL)</label>
                            <input type="url" id="media-modal-url-input" placeholder="https://..." style="font-size:13px; width:100%; border:1px solid #ddd; padding:8px; border-radius:6px; box-sizing:border-box; outline:none;">
                        </div>

                        <div style="background:#f8fafc; padding:12px; border-radius:8px; margin-bottom:16px; border:1px solid #edf2f7;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                <label style="font-size:13px; color:#4a5568; font-weight:bold;">가로 크기 (px)</label>
                                <input type="text" id="media-modal-width" style="width:130px; padding:6px; border:1px solid #cbd5e1; border-radius:4px; text-align:right;">
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                <label style="font-size:13px; color:#4a5568; font-weight:bold;">세로 크기 (px)</label>
                                <input type="text" id="media-modal-height" style="width:130px; padding:6px; border:1px solid #cbd5e1; border-radius:4px; text-align:right;">
                            </div>
                            <div style="font-size:12px; color:#4a5568; margin-top:6px;">
                                <label style="cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;">
                                    <input type="checkbox" id="media-modal-lock" checked> 🔒 종횡 비율 유지하기
                                </label>
                            </div>
                        </div>
                        
                        <div style="display:flex; justify-content:flex-end; gap:8px;">
                            <button type="button" id="media-modal-cancel" style="padding:8px 14px; border:1px solid #cbd5e1; background:#fff; color:#475569; border-radius:6px; cursor:pointer; font-size:13px; font-weight:500;">취소</button>
                            <button type="button" id="media-modal-confirm" style="padding:8px 14px; border:none; background:#1a73e8; color:#fff; border-radius:6px; cursor:pointer; font-size:13px; font-weight:bold;">적용하기</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(uiWrapper);

            // 공용 컨텍스트 메뉴 이벤트 연결
            document.getElementById('menu-item-edit-media').onclick = () => {
                document.getElementById('quill-media-context-menu').style.display = 'none';
                if (NoticeEditor.activeInstance) NoticeEditor.activeInstance.triggerEditModalFromMenu();
            };
            
            document.getElementById('menu-item-delete-media').onclick = () => {
                document.getElementById('quill-media-context-menu').style.display = 'none';
                if (NoticeEditor.activeInstance) NoticeEditor.activeInstance.deleteTargetMedia();
            };
        }
    }

    renderUI() {
        this.container.style.cssText = "padding: 15px; margin-bottom: 20px; background: #fdfdfd; border: 1px dashed #1a73e8; border-radius: 6px; display: flex; flex-direction: column; gap: 8px;";
        
        // 💡 HTML 모드 토글 버튼 및 에디터/HTML 뷰어 분리 컨테이너 추가
        this.container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                <div style="font-weight:bold; color:#1a73e8; font-size:14px;" class="admin-form-title">📝 새 글 작성</div>
                <button type="button" class="btn-toggle-html" style="background:#475569; color:#fff; border:none; padding:4px 10px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:bold;">💻 HTML 편집 모드 켜기</button>
            </div>
            
            <input type="text" class="new-notice-title" placeholder="제목" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
            
            <div class="editor-view-container" style="background:#fff; border-radius:4px; position:relative;">
                <div class="editor-wrapper">
                    <div class="new-notice-editor" style="height: 250px; font-size: 14px;"></div>
                </div>
                <textarea class="new-notice-html-view" placeholder="이곳에 커스텀 HTML 태그 및 CSS를 자유롭게 작성하세요.\\n\\n⚠️ 주의: HTML 모드 상태에서 고급 스타일(무지개색, 애니메이션 등)을 입력 후, '에디터(WYSIWYG) 모드'로 되돌아가면 안전하지 않은 태그는 퀼(Quill) 에디터에 의해 삭제될 수 있습니다. 고급 코드를 유지하려면 이 HTML 모드를 켠 상태에서 바로 '저장하기' 버튼을 누르세요." style="display:none; width:100%; height:300px; padding:15px; box-sizing:border-box; font-family:monospace; border:1px solid #ccc; font-size:13px; line-height:1.5; background:#1e1e1e; color:#d4d4d4; resize:vertical;"></textarea>
            </div>
            
            <div style="border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; margin-top: 4px;">
                <div class="latex-guide-toggle" style="background: #f8fafc; padding: 8px 12px; font-size: 13px; font-weight: bold; color: #475569; cursor: pointer; display: flex; justify-content: space-between; align-items: center; user-select: none;">
                    <span>📐 LaTeX 수식 작성 문법 가이드 보기</span>
                    <span class="latex-guide-arrow" style="transition: transform 0.2s;">▶</span>
                </div>
                <div class="latex-guide-content" style="display: none; padding: 12px; background: #ffffff; font-size: 13px; border-top: 1px solid #e2e8f0; line-height: 1.6; max-height: 250px; overflow-y: auto;"></div>
            </div>
            
            <div style="font-weight:bold; font-size:12px; color:#555; margin-top:10px;">📎 파일 / 링크 첨부 (다중 지원)</div>
            <div class="link-inputs-container" style="display:flex; flex-direction:column; gap:8px;"></div>
            
            <div style="display:flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                <button type="button" class="btn-add-link-row" style="background:none; border:1px solid #5f6368; color:#5f6368; border-radius:4px; padding:6px 12px; font-size:12px; cursor:pointer;">+ 링크 입력칸 추가</button>
                <div style="display:flex; gap:10px;">
                    <button type="button" class="btn-cancel-edit" style="display:none; background:#f1f3f4; color:#333; border:none; border-radius:4px; padding: 8px 16px; cursor:pointer;">수정 취소</button>
                    <button class="btn-submit-notice cl-btn-primary" style="padding: 8px 16px; cursor:pointer; background:#1a73e8; color:white; border:none; border-radius:4px;">저장하기</button>
                </div>
            </div>
        `;
        this.addLinkRow();
    }

    initQuill() {
        if (!window.Quill) return;

        // 💡 1. 폰트 크기, 글꼴, 줄 간격 지정을 위한 Parchment 스타일 모듈 등록
        const Parchment = window.Quill.import('parchment');
        
        const SizeClass = window.Quill.import('attributors/style/size');
        SizeClass.whitelist = ['10px', '12px', '14px', '16px', '18px', '20px', '24px', '30px'];
        window.Quill.register(SizeClass, true);

        const FontClass = window.Quill.import('attributors/style/font');
        // 원하는 글꼴 추가 (시스템 기본 폰트 위주)
        FontClass.whitelist = ['sans-serif', 'serif', 'monospace', 'Nanum Gothic', 'Malgun Gothic', '궁서체', 'Comic Sans MS'];
        window.Quill.register(FontClass, true);

        const LineHeightClass = new Parchment.Attributor.Style('line-height', 'line-height', {
            scope: Parchment.Scope.BLOCK, // 블록(문단) 단위 적용
            whitelist: ['1.0', '1.2', '1.5', '1.8', '2.0', '2.5', '3.0']
        });
        window.Quill.register(LineHeightClass, true);

        const targetEditorTarget = this.container.querySelector('.new-notice-editor');
        
        this.quill = new Quill(targetEditorTarget, {
            theme: 'snow',
            placeholder: '본문 내용 입력 (볼드, 색상, 수식 및 이미지/동영상 삽입 가능)',
            modules: {
                toolbar: {
                    container: [
                        // 💡 2. 툴바 배열에 새로 등록한 글꼴, 크기, 줄간격 옵션 추가
                        [{ 'font': FontClass.whitelist }, { 'size': SizeClass.whitelist }],
                        [{ 'line-height': LineHeightClass.whitelist }, { 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'color': [] }, { 'background': [] }],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        [{ 'align': [] }],
                        ['link', 'image', 'video', 'clean']
                    ]
                }
            }
        });

        const toolbar = this.quill.getModule('toolbar');
        toolbar.addHandler('image', () => { this.openMediaModal('upload', 'image'); });
        toolbar.addHandler('video', () => { this.openMediaModal('upload', 'video'); });
    }

    bindModalEvents() {
        document.getElementById('tab-btn-file').onclick = () => this.switchTab('file');
        document.getElementById('tab-btn-url').onclick = () => this.switchTab('url');
        document.getElementById('media-modal-cancel').onclick = () => {
            document.getElementById('quill-media-modal').style.display = 'none';
        };

        const wInput = document.getElementById('media-modal-width');
        const hInput = document.getElementById('media-modal-height');
        const lockBtn = document.getElementById('media-modal-lock');
        const fileInput = document.getElementById('media-modal-file-input');
        const modal = document.getElementById('quill-media-modal');

        wInput.oninput = () => {
            if (lockBtn.checked && wInput.value && this.modalState.ratio && !isNaN(wInput.value)) {
                hInput.value = Math.round(wInput.value / this.modalState.ratio);
            }
        };
        hInput.oninput = () => {
            if (lockBtn.checked && hInput.value && this.modalState.ratio && !isNaN(hInput.value)) {
                wInput.value = Math.round(hInput.value * this.modalState.ratio);
            }
        };

        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            this.modalState.file = file;
            const fileUrl = URL.createObjectURL(file);

            if (this.modalState.type === 'image') {
                const img = new Image();
                img.onload = () => {
                    this.modalState.ratio = img.width / img.height;
                    wInput.value = img.width; hInput.value = img.height;
                    this.setInputDisabled(false);
                    URL.revokeObjectURL(fileUrl);
                };
                img.src = fileUrl;
            } else {
                const video = document.createElement('video');
                video.onloadedmetadata = () => {
                    this.modalState.ratio = video.videoWidth / video.videoHeight;
                    wInput.value = video.videoWidth; hInput.value = video.videoHeight;
                    this.setInputDisabled(false);
                    URL.revokeObjectURL(fileUrl);
                };
                video.src = fileUrl;
            }
        };

        document.getElementById('media-modal-confirm').onclick = async () => {
            if (this.modalState.mode === 'upload') {
                if (this.modalState.source === 'file') {
                    const reqWidth = wInput.value || (this.modalState.type === 'video' ? 640 : 400);
                    const reqHeight = hInput.value || (this.modalState.type === 'video' ? 360 : 300);
                    
                    if (!this.modalState.file) return alert("업로드할 미디어 파일을 골라주세요.");
                    modal.style.display = 'none';
                    await this.executeUpload(this.modalState.file, reqWidth, reqHeight);
                } else {
                    const url = document.getElementById('media-modal-url-input').value.trim();
                    if (!url) return alert("올바른 미디어 URL 주소를 입력해 주세요.");
                    
                    const reqWidth = this.modalState.type === 'video' ? 640 : 'auto';
                    const reqHeight = this.modalState.type === 'video' ? 360 : 'auto';
                    
                    modal.style.display = 'none';
                    this.insertIntoQuill(this.formatVideoUrl(url), reqWidth, reqHeight);
                }
            } else if (this.modalState.mode === 'edit' && this.modalState.targetNode) {
                modal.style.display = 'none';
                const node = this.modalState.targetNode;
                const reqWidth = wInput.value;
                const reqHeight = hInput.value;
                
                node.setAttribute('width', reqWidth);
                node.setAttribute('height', reqHeight);
                node.style.width = reqWidth + 'px';
                node.style.height = reqHeight + 'px';
            }
        };
    }

    openMediaModal(mode, type, targetNode = null, width = '', height = '') {
        this.modalState.mode = mode;
        this.modalState.type = type;
        this.modalState.targetNode = targetNode;
        this.modalState.file = null;

        this.bindModalEvents();

        const modal = document.getElementById('quill-media-modal');
        const title = document.getElementById('media-modal-title');
        const tabBar = document.getElementById('media-modal-tab-bar');
        const wInput = document.getElementById('media-modal-width');
        const hInput = document.getElementById('media-modal-height');
        const fileInput = document.getElementById('media-modal-file-input');
        const urlInput = document.getElementById('media-modal-url-input');
        
        const label = type === 'image' ? '이미지' : '동영상';

        wInput.placeholder = ''; 
        hInput.placeholder = '';

        if (mode === 'upload') {
            title.innerText = `🖼️ 새 ${label} 추가 옵션`;
            tabBar.style.display = 'flex';
            fileInput.value = '';
            urlInput.value = '';
            fileInput.accept = type === 'image' ? 'image/*' : 'video/*';
            
            const initialSource = type === 'video' ? 'url' : 'file';
            this.switchTab(initialSource);
        } else {
            title.innerText = `⚙️ ${label} 크기 속성 수정`;
            tabBar.style.display = 'none';
            document.getElementById('media-modal-file-wrapper').style.display = 'none';
            document.getElementById('media-modal-url-wrapper').style.display = 'none';
            
            wInput.value = Math.round(width);
            hInput.value = Math.round(height);
            this.setInputDisabled(false);
        }

        modal.style.display = 'flex';
    }

    switchTab(sourceType) {
        this.modalState.source = sourceType;
        const btnFile = document.getElementById('tab-btn-file');
        const btnUrl = document.getElementById('tab-btn-url');
        const fileWrapper = document.getElementById('media-modal-file-wrapper');
        const urlWrapper = document.getElementById('media-modal-url-wrapper');
        const wInput = document.getElementById('media-modal-width');
        const hInput = document.getElementById('media-modal-height');

        wInput.placeholder = '';
        hInput.placeholder = '';

        if (sourceType === 'file') {
            btnFile.style.background = '#fff'; btnFile.style.color = '#1a73e8';
            btnUrl.style.background = 'transparent'; btnUrl.style.color = '#5f6368';
            fileWrapper.style.display = 'block';
            urlWrapper.style.display = 'none';
            
            if (!this.modalState.file) {
                this.setInputDisabled(true);
                wInput.value = ''; hInput.value = '';
            } else {
                this.setInputDisabled(false);
            }
        } else {
            btnUrl.style.background = '#fff'; btnUrl.style.color = '#1a73e8';
            btnFile.style.background = 'transparent'; btnFile.style.color = '#5f6368';
            fileWrapper.style.display = 'none';
            urlWrapper.style.display = 'block';
            
            this.setInputDisabled(true);
            wInput.value = ''; hInput.value = '';
        }
    }

    setInputDisabled(disabled) {
        const w = document.getElementById('media-modal-width');
        const h = document.getElementById('media-modal-height');
        w.disabled = disabled; h.disabled = disabled;
        w.style.background = disabled ? "#f1f3f4" : "#fff";
        h.style.background = disabled ? "#f1f3f4" : "#fff";
    }

    triggerEditModalFromMenu() {
        const node = this.modalState.targetNode;
        if (!node) return;
        const currentW = parseFloat(node.getAttribute('width') || node.style.width || node.clientWidth);
        const currentH = parseFloat(node.getAttribute('height') || node.style.height || node.clientHeight);
        this.modalState.ratio = currentW / currentH; 
        this.openMediaModal('edit', this.modalState.type, node, currentW, currentH);
    }

    deleteTargetMedia() {
        const node = this.modalState.targetNode;
        if (!node) return;
        
        if (window.Quill) {
            const blot = window.Quill.find(node);
            if (blot) {
                blot.deleteAt(0, blot.length());
                return;
            }
        }
        node.remove(); 
    }

    initEvents() {
        const contextMenu = document.getElementById('quill-media-context-menu');

        // 🖱️ 우클릭 감지 (CSS 트릭을 활용한 좌표 기반 타겟 검출)
        const editorContent = this.container.querySelector('.ql-editor');
        editorContent.addEventListener('contextmenu', (e) => {
            const medias = editorContent.querySelectorAll('img, iframe, video');
            let targetMedia = null;
            
            for (let media of medias) {
                const rect = media.getBoundingClientRect();
                if (e.clientX >= rect.left - 1 && e.clientX <= rect.right + 1 &&
                    e.clientY >= rect.top - 1 && e.clientY <= rect.bottom + 1) {
                    targetMedia = media;
                    break;
                }
            }

            if (targetMedia) {
                e.preventDefault(); 
                NoticeEditor.activeInstance = this;
                
                contextMenu.style.display = 'block';
                contextMenu.style.left = e.clientX + 'px';
                contextMenu.style.top = e.clientY + 'px';
                
                this.modalState.targetNode = targetMedia;
                this.modalState.type = targetMedia.tagName === 'IMG' ? 'image' : 'video';
            }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#quill-media-context-menu')) contextMenu.style.display = 'none';
        });

        // 💡 복사+붙여넣기(Ctrl+V) 시 자동 업로드 처리
        this.quill.root.addEventListener('paste', async (e) => {
            const clipboardData = e.clipboardData || window.clipboardData;
            if (!clipboardData || !clipboardData.items) return;

            let hasImage = false;
            for (let i = 0; i < clipboardData.items.length; i++) {
                if (clipboardData.items[i].type.indexOf('image') !== -1) {
                    hasImage = true;
                    break;
                }
            }

            if (hasImage) {
                e.preventDefault(); 

                for (let i = 0; i < clipboardData.items.length; i++) {
                    const item = clipboardData.items[i];
                    if (item.type.indexOf('image') !== -1) {
                        const file = item.getAsFile();
                        if (!file) continue;

                        const range = this.quill.getSelection(true) || { index: this.quill.getLength() };
                        const placeholder = '[이미지 업로드 중...⏳]';
                        this.quill.insertText(range.index, placeholder);

                        const formData = new FormData();
                        formData.append('file', file);
                        formData.append('upload_preset', this.uploadPreset);

                        try {
                            const response = await fetch(this.cloudinaryUrl, { method: 'POST', body: formData });
                            const result = await response.json();

                            this.quill.deleteText(range.index, placeholder.length);

                            if (result.secure_url) {
                                this.modalState.type = 'image'; 
                                this.insertIntoQuill(result.secure_url, 'auto', 'auto', range.index);
                            } else {
                                throw new Error('업로드 거부');
                            }
                        } catch (error) {
                            console.error("Paste upload error:", error);
                            this.quill.deleteText(range.index, placeholder.length);
                            alert("붙여넣은 이미지 서버 업로드에 실패했습니다.");
                        }
                    }
                }
            }
        });

        // 💡 HTML / WYSIWYG 모드 전환 이벤트
        const btnToggleHtml = this.container.querySelector('.btn-toggle-html');
        const htmlView = this.container.querySelector('.new-notice-html-view');
        const editorWrapper = this.container.querySelector('.editor-wrapper');
        
        btnToggleHtml.addEventListener('click', () => {
            if (this.isHtmlMode) {
                // HTML -> 에디터 복귀
                this.quill.clipboard.dangerouslyPasteHTML(htmlView.value);
                htmlView.style.display = 'none';
                editorWrapper.style.display = 'block';
                
                const toolbarElem = this.container.querySelector('.ql-toolbar');
                if (toolbarElem) toolbarElem.style.display = 'block';
                
                btnToggleHtml.innerText = "💻 HTML 편집 모드 켜기";
                btnToggleHtml.style.background = "#475569";
                this.isHtmlMode = false;
            } else {
                // 에디터 -> HTML 전환
                htmlView.value = this.quill.root.innerHTML;
                htmlView.style.display = 'block';
                editorWrapper.style.display = 'none';
                
                const toolbarElem = this.container.querySelector('.ql-toolbar');
                if (toolbarElem) toolbarElem.style.display = 'none';
                
                btnToggleHtml.innerText = "👀 에디터(WYSIWYG) 모드로 복귀";
                btnToggleHtml.style.background = "#1a73e8";
                this.isHtmlMode = true;
            }
        });

        this.container.querySelector('.btn-add-link-row').addEventListener('click', () => this.addLinkRow());
        this.container.querySelector('.link-inputs-container').addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-remove-link-row')) e.target.closest('.link-input-row').remove();
        });
        
        this.container.querySelector('.btn-cancel-edit').addEventListener('click', () => {
            this.reset();
            if (this.callbacks.onCancel) this.callbacks.onCancel();
        });
        
        this.container.querySelector('.btn-submit-notice').addEventListener('click', async (e) => {
            const title = this.container.querySelector('.new-notice-title').value.trim();
            
            // 💡 HTML 모드가 켜진 상태라면 textarea 값을 우선 추출하여 고급 태그를 보존
            const bodyHtml = this.isHtmlMode ? htmlView.value : (this.quill ? this.quill.root.innerHTML : '');
            
            if (!title) return alert("제목을 입력해주세요.");
            
            const fileRows = this.container.querySelectorAll('.link-input-row');
            let filesArray = [];
            fileRows.forEach(row => {
                const name = row.querySelector('.new-notice-file-name').value.trim();
                const url = row.querySelector('.new-notice-file-url').value.trim();
                if (url) filesArray.push({ name: name || '첨부 링크 열기', url: url });
            });
            
            e.target.innerText = "저장 중...";
            e.target.disabled = true;
            try {
                if (this.callbacks.onSubmit) await this.callbacks.onSubmit({ title, bodyHtml, files: filesArray });
                this.reset();
            } catch (err) {
                console.error(err);
                alert("저장 중 오류가 발생했습니다.");
            } finally {
                e.target.innerText = "저장하기";
                e.target.disabled = false;
            }
        });

        const latexToggleBtn = this.container.querySelector('.latex-guide-toggle');
        const latexContent = this.container.querySelector('.latex-guide-content');
        const latexArrow = this.container.querySelector('.latex-guide-arrow');

        if (latexToggleBtn) {
            latexContent.innerHTML = this.latexGuide;
            latexToggleBtn.addEventListener('click', () => {
                const isHidden = latexContent.style.display === 'none';
                latexContent.style.display = isHidden ? 'block' : 'none';
                latexArrow.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
            });
        }
    }

    formatVideoUrl(url) {
        if (this.modalState.type !== 'video') return url;
        const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
        if (ytMatch) {
            return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0&controls=1&rel=0`;
        }
        return url;
    }

    async executeUpload(file, reqWidth, reqHeight) {
        const range = this.quill.getSelection() || { index: this.quill.getLength() };
        const placeholder = '[미디어 전송 중...⏳]';
        this.quill.insertText(range.index, placeholder);
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', this.uploadPreset);

        try {
            const response = await fetch(this.cloudinaryUrl, { method: 'POST', body: formData });
            const result = await response.json();

            if (result.secure_url) {
                this.quill.deleteText(range.index, placeholder.length);
                this.insertIntoQuill(result.secure_url, reqWidth, reqHeight, range.index);
            } else {
                throw new Error('업로드 거부');
            }
        } catch (error) {
            console.error(error);
            this.quill.deleteText(range.index, placeholder.length);
            alert("서버 업로드에 실패했습니다.");
        }
    }

    insertIntoQuill(url, width, height, insertIndex = null) {
        const range = insertIndex !== null ? { index: insertIndex } : (this.quill.getSelection() || { index: this.quill.getLength() });
        const embedType = this.modalState.type; 
        
        this.quill.insertEmbed(range.index, embedType, url);
        
        setTimeout(() => {
            const selector = embedType === 'image' ? `img[src="${url}"]` : `iframe[src="${url}"], video`;
            const nodes = this.container.querySelectorAll(selector);
            if (nodes.length > 0) {
                const targetNode = nodes[nodes.length - 1];
                
                if (width !== 'auto' && height !== 'auto') {
                    targetNode.setAttribute('width', width);
                    targetNode.setAttribute('height', height);
                    targetNode.style.width = width + 'px';
                    targetNode.style.height = height + 'px';
                }

                if (targetNode.tagName === 'VIDEO') {
                    targetNode.removeAttribute('autoplay');
                    targetNode.setAttribute('controls', 'true');
                    targetNode.setAttribute('preload', 'metadata');
                }
            }
        }, 60);

        this.quill.setSelection(range.index + 1);
    }

    addLinkRow(name = '', url = '') {
        const container = this.container.querySelector('.link-inputs-container');
        const row = document.createElement('div');
        row.className = 'link-input-row';
        row.style.cssText = 'display:flex; gap: 10px; align-items:center;';
        row.innerHTML = `
            <input type="text" class="new-notice-file-name" placeholder="링크 이름" value="${name}" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; width: 30%;">
            <input type="url" class="new-notice-file-url" placeholder="URL (http://...)" value="${url}" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; flex:1;">
            <button type="button" class="btn-remove-link-row" style="background:none; border:none; cursor:pointer; color:#d93025; font-size:16px; flex-shrink:0;">✕</button>
        `;
        container.appendChild(row);
    }

    setData(title, body, files) {
        // 기존 뷰 상태 강제 리셋 (HTML 모드가 열려 있었다면 닫기)
        if (this.isHtmlMode) { 
            this.container.querySelector('.btn-toggle-html').click(); 
        }

        this.container.querySelector('.new-notice-title').value = title;
        if (this.quill) this.quill.clipboard.dangerouslyPasteHTML(body || '');
        const linkContainer = this.container.querySelector('.link-inputs-container');
        linkContainer.innerHTML = '';
        if (files && files.length > 0) files.forEach(f => this.addLinkRow(f.name, f.url));
        else this.addLinkRow();
    }

    reset() {
        if (this.isHtmlMode) { 
            this.container.querySelector('.btn-toggle-html').click(); 
        }
        
        this.container.querySelector('.new-notice-title').value = '';
        if (this.quill) this.quill.setContents([]);
        this.container.querySelector('.link-inputs-container').innerHTML = '';
        this.addLinkRow();
    }
}
