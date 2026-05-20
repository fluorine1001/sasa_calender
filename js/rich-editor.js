export class NoticeEditor {
    constructor(containerId, latexGuide, callbacks) {
        this.container = document.getElementById(containerId);
        this.latexGuide = latexGuide;
        this.callbacks = callbacks;
        this.quill = null;
        
        // 💡 Cloudinary 설정 (비디오와 이미지를 모두 받기 위해 'auto' 사용)
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

    // 📌 전역 UI (통합 모달창, 우클릭 메뉴)
    renderGlobalUI() {
        if (document.getElementById('quill-custom-media-ui')) return;

        const uiWrapper = document.createElement('div');
        uiWrapper.id = 'quill-custom-media-ui';
        uiWrapper.innerHTML = `
            <div id="quill-media-context-menu" style="display:none; position:fixed; background:#fff; border:1px solid #ccc; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius:4px; z-index:10000; padding:4px 0; font-size:13px; min-width:130px;">
                <div id="menu-item-edit-media" style="padding:8px 12px; cursor:pointer; color:#333; transition: background 0.2s;">⚙️ 미디어 속성 변경</div>
            </div>

            <div id="quill-media-modal" style="display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.4); z-index:10001; align-items:center; justify-content:center;">
                <div style="background:#fff; padding:20px 24px; border-radius:8px; width:320px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                    <h4 style="margin:0 0 15px 0; color:#1a73e8; font-size: 15px;" id="media-modal-title">🖼️ 미디어 업로드</h4>
                    
                    <div id="media-modal-source-section" style="margin-bottom: 12px; font-size:13px; display:flex; gap:15px;">
                        <label style="cursor:pointer;"><input type="radio" name="media-source" value="file" checked> 직접 파일 업로드</label>
                        <label style="cursor:pointer;"><input type="radio" name="media-source" value="url"> URL 링크 삽입</label>
                    </div>

                    <div id="media-modal-file-wrapper" style="margin-bottom: 15px;">
                        <input type="file" id="media-modal-file-input" style="font-size:12px; width:100%; border:1px solid #ddd; padding:4px; border-radius:4px; background:#f9f9f9;">
                    </div>

                    <div id="media-modal-url-wrapper" style="margin-bottom: 15px; display:none;">
                        <input type="url" id="media-modal-url-input" placeholder="https://..." style="font-size:13px; width:100%; border:1px solid #ddd; padding:6px; border-radius:4px; box-sizing:border-box;">
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <label style="font-size:13px; color:#555; font-weight:bold;">가로 (px)</label>
                        <input type="number" id="media-modal-width" style="width:100px; padding:6px; border:1px solid #ddd; border-radius:4px; text-align:right;">
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                        <label style="font-size:13px; color:#555; font-weight:bold;">세로 (px)</label>
                        <input type="number" id="media-modal-height" style="width:100px; padding:6px; border:1px solid #ddd; border-radius:4px; text-align:right;">
                    </div>
                    
                    <div style="margin-bottom:20px; font-size:13px; color:#333;">
                        <label style="cursor:pointer; display:flex; align-items:center; gap:6px;">
                            <input type="checkbox" id="media-modal-lock" checked> 🔒 크기 비율 유지
                        </label>
                    </div>
                    
                    <div style="display:flex; justify-content:flex-end; gap:8px;">
                        <button type="button" id="media-modal-cancel" style="padding:6px 12px; border:1px solid #ddd; background:#f9f9f9; color:#333; border-radius:4px; cursor:pointer; font-size:13px;">취소</button>
                        <button type="button" id="media-modal-confirm" style="padding:6px 12px; border:none; background:#1a73e8; color:#fff; border-radius:4px; cursor:pointer; font-size:13px;">확인</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(uiWrapper);

        const menuBtn = document.getElementById('menu-item-edit-media');
        menuBtn.onmouseover = () => menuBtn.style.background = '#f1f3f4';
        menuBtn.onmouseout = () => menuBtn.style.background = '#fff';
    }

    renderUI() {
        this.container.style.cssText = "padding: 15px; margin-bottom: 20px; background: #fdfdfd; border: 1px dashed #1a73e8; border-radius: 6px; display: flex; flex-direction: column; gap: 8px;";
        this.container.innerHTML = `
            <div style="font-weight:bold; color:#1a73e8; font-size:14px; margin-bottom:5px;" id="admin-form-title">📝 새 공지사항 작성</div>
            <input type="text" id="new-notice-title" placeholder="공지사항 제목" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
            
            <div id="editor-wrapper" style="background:#fff; border-radius:4px;">
                <div id="new-notice-editor" style="height: 250px; font-size: 14px;"></div>
            </div>
            
            <div style="border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; margin-top: 4px;">
                <div id="latex-guide-toggle" style="background: #f8fafc; padding: 8px 12px; font-size: 13px; font-weight: bold; color: #475569; cursor: pointer; display: flex; justify-content: space-between; align-items: center; user-select: none;">
                    <span>📐 LaTeX 수식 작성 문법 가이드 보기</span>
                    <span id="latex-guide-arrow" style="transition: transform 0.2s;">▶</span>
                </div>
                <div id="latex-guide-content" style="display: none; padding: 12px; background: #ffffff; font-size: 13px; border-top: 1px solid #e2e8f0; line-height: 1.6; max-height: 250px; overflow-y: auto;"></div>
            </div>
            
            <div style="font-weight:bold; font-size:12px; color:#555; margin-top:10px;">📎 파일 / 링크 첨부 (다중 지원)</div>
            <div id="link-inputs-container" style="display:flex; flex-direction:column; gap:8px;"></div>
            
            <div style="display:flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                <button type="button" id="btn-add-link-row" style="background:none; border:1px solid #5f6368; color:#5f6368; border-radius:4px; padding:6px 12px; font-size:12px; cursor:pointer;">+ 링크 입력칸 추가</button>
                <div style="display:flex; gap:10px;">
                    <button type="button" id="btn-cancel-edit" style="display:none; background:#f1f3f4; color:#333; border:none; border-radius:4px; padding: 8px 16px; cursor:pointer;">수정 취소</button>
                    <button id="btn-submit-notice" class="cl-btn-primary" style="padding: 8px 16px; cursor:pointer; background:#1a73e8; color:white; border:none; border-radius:4px;">공지 등록</button>
                </div>
            </div>
        `;
        this.addLinkRow();
    }

    initQuill() {
        if (!window.Quill) return;
        this.quill = new Quill('#new-notice-editor', {
            theme: 'snow',
            placeholder: '본문 내용 입력 (볼드, 색상, 수식 및 이미지/동영상 삽입 가능)',
            modules: {
                toolbar: {
                    container: [
                        [{ 'header': [1, 2, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'color': [] }, { 'background': [] }],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        ['link', 'image', 'video', 'clean']
                    ],
                    handlers: {
                        image: () => this.openMediaModal('upload', 'image'),
                        video: () => this.openMediaModal('upload', 'video')
                    }
                }
            }
        });
    }

    // 📌 모달 열기 로직 (초기화)
    openMediaModal(mode, type, targetNode = null, width = '', height = '') {
        if (this.cloudinaryUrl.includes("YOUR_CLOUD_NAME")) return alert("⚠️ Cloudinary 설정 정보를 입력해주세요!");
        
        this.modalState.mode = mode;
        this.modalState.type = type;
        this.modalState.targetNode = targetNode;
        this.modalState.file = null;

        const modal = document.getElementById('quill-media-modal');
        const title = document.getElementById('media-modal-title');
        const sourceSection = document.getElementById('media-modal-source-section');
        const fileWrapper = document.getElementById('media-modal-file-wrapper');
        const urlWrapper = document.getElementById('media-modal-url-wrapper');
        const fileInput = document.getElementById('media-modal-file-input');
        const urlInput = document.getElementById('media-modal-url-input');
        const wInput = document.getElementById('media-modal-width');
        const hInput = document.getElementById('media-modal-height');
        
        const typeLabel = type === 'image' ? '이미지' : '동영상';

        if (mode === 'upload') {
            title.innerText = `[${typeLabel}] 파일 및 크기 지정`;
            sourceSection.style.display = 'flex';
            
            // 기본값 설정: 비디오는 URL이 잦으므로 URL 우선, 이미지는 파일 우선
            const radios = document.getElementsByName('media-source');
            if (type === 'video') radios[1].checked = true;
            else radios[0].checked = true;
            
            this.toggleSourceUI(); // UI 토글 실행

            fileInput.value = '';
            fileInput.accept = type === 'image' ? 'image/*' : 'video/*';
            urlInput.value = '';
            
            // 크기 기본값 (비디오 URL의 경우 기본 640x360 부여)
            if (type === 'video') {
                wInput.value = 640; hInput.value = 360;
                this.modalState.ratio = 640/360;
                wInput.disabled = false; hInput.disabled = false;
                wInput.style.background = "#fff"; hInput.style.background = "#fff";
            } else {
                wInput.value = ''; hInput.value = '';
                wInput.disabled = true; hInput.disabled = true;
                wInput.style.background = "#f1f3f4"; hInput.style.background = "#f1f3f4";
            }
        } else {
            // 속성 수정 모드
            title.innerText = `⚙️ ${typeLabel} 속성 수정`;
            sourceSection.style.display = 'none';
            fileWrapper.style.display = 'none';
            urlWrapper.style.display = 'none';
            
            wInput.value = Math.round(width);
            hInput.value = Math.round(height);
            wInput.disabled = false; hInput.disabled = false;
            wInput.style.background = "#fff"; hInput.style.background = "#fff";
        }

        modal.style.display = 'flex';
    }

    // 파일/URL UI 토글 함수
    toggleSourceUI() {
        const source = document.querySelector('input[name="media-source"]:checked').value;
        this.modalState.source = source;
        document.getElementById('media-modal-file-wrapper').style.display = source === 'file' ? 'block' : 'none';
        document.getElementById('media-modal-url-wrapper').style.display = source === 'url' ? 'block' : 'none';
        
        // URL 모드로 전환시, 사용자가 타이핑하기 전이라도 크기를 입력할 수 있게 활성화
        if (source === 'url') {
            const wInput = document.getElementById('media-modal-width');
            const hInput = document.getElementById('media-modal-height');
            wInput.disabled = false; hInput.disabled = false;
            wInput.style.background = "#fff"; hInput.style.background = "#fff";
        }
    }

    initEvents() {
        const modal = document.getElementById('quill-media-modal');
        const contextMenu = document.getElementById('quill-media-context-menu');
        const fileInput = document.getElementById('media-modal-file-input');
        const wInput = document.getElementById('media-modal-width');
        const hInput = document.getElementById('media-modal-height');
        const lockBtn = document.getElementById('media-modal-lock');

        // 라디오 버튼 변경 이벤트
        document.getElementsByName('media-source').forEach(radio => {
            radio.addEventListener('change', () => this.toggleSourceUI());
        });

        // 📌 파일 선택 시 이미지/비디오 원본 해상도 추출 로직
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            this.modalState.file = file;
            const fileUrl = URL.createObjectURL(file);

            if (this.modalState.type === 'image') {
                const img = new Image();
                img.onload = () => {
                    this.modalState.ratio = img.width / img.height;
                    wInput.value = img.width; hInput.value = img.height;
                    this.enableSizeInputs(wInput, hInput);
                    URL.revokeObjectURL(fileUrl);
                };
                img.src = fileUrl;
            } else {
                const video = document.createElement('video');
                video.onloadedmetadata = () => {
                    this.modalState.ratio = video.videoWidth / video.videoHeight;
                    wInput.value = video.videoWidth; hInput.value = video.videoHeight;
                    this.enableSizeInputs(wInput, hInput);
                    URL.revokeObjectURL(fileUrl);
                };
                video.src = fileUrl;
            }
        });

        // 실시간 비율 계산
        wInput.oninput = () => {
            if (lockBtn.checked && wInput.value && this.modalState.ratio) {
                hInput.value = Math.round(wInput.value / this.modalState.ratio);
            }
        };
        hInput.oninput = () => {
            if (lockBtn.checked && hInput.value && this.modalState.ratio) {
                wInput.value = Math.round(hInput.value * this.modalState.ratio);
            }
        };

        document.getElementById('media-modal-cancel').onclick = () => modal.style.display = 'none';

        // 📌 모달 확인 버튼 (업로드/적용)
        document.getElementById('media-modal-confirm').onclick = async () => {
            const reqWidth = wInput.value || 640;
            const reqHeight = hInput.value || 360;

            if (this.modalState.mode === 'upload') {
                if (this.modalState.source === 'file') {
                    if (!this.modalState.file) return alert("파일을 먼저 선택해주세요.");
                    modal.style.display = 'none';
                    await this.executeUpload(this.modalState.file, reqWidth, reqHeight);
                } else {
                    const url = document.getElementById('media-modal-url-input').value.trim();
                    if (!url) return alert("URL을 입력해주세요.");
                    modal.style.display = 'none';
                    this.insertIntoQuill(this.formatVideoUrl(url), reqWidth, reqHeight);
                }
            } else if (this.modalState.mode === 'edit' && this.modalState.targetNode) {
                modal.style.display = 'none';
                this.modalState.targetNode.setAttribute('width', reqWidth);
                this.modalState.targetNode.setAttribute('height', reqHeight);
                this.modalState.targetNode.style.width = reqWidth + 'px';
                this.modalState.targetNode.style.height = reqHeight + 'px';
            }
        };

        // 🖱️ 우클릭 방지 및 커스텀 메뉴 (IMG 및 IFRAME 대상)
        const editorContent = this.container.querySelector('.ql-editor');
        editorContent.addEventListener('contextmenu', (e) => {
            if (e.target.tagName === 'IMG' || e.target.tagName === 'IFRAME') {
                e.preventDefault(); 
                contextMenu.style.display = 'block';
                contextMenu.style.left = e.clientX + 'px';
                contextMenu.style.top = e.clientY + 'px';
                this.modalState.targetNode = e.target;
                this.modalState.type = e.target.tagName === 'IMG' ? 'image' : 'video';
            }
        });

        // 우클릭 메뉴 클릭
        document.getElementById('menu-item-edit-media').onclick = () => {
            contextMenu.style.display = 'none';
            const node = this.modalState.targetNode;
            const currentW = parseFloat(node.getAttribute('width') || node.style.width || node.clientWidth);
            const currentH = parseFloat(node.getAttribute('height') || node.style.height || node.clientHeight);
            this.modalState.ratio = currentW / currentH; 
            this.openMediaModal('edit', this.modalState.type, node, currentW, currentH);
        };

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#quill-media-context-menu')) contextMenu.style.display = 'none';
        });

        // 제출 및 링크 UI 로직 (기존과 동일)
        this.container.querySelector('#btn-add-link-row').addEventListener('click', () => this.addLinkRow());
        this.container.querySelector('#link-inputs-container').addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-remove-link-row')) e.target.closest('.link-input-row').remove();
        });
        this.container.querySelector('#btn-cancel-edit').addEventListener('click', () => {
            this.reset();
            if (this.callbacks.onCancel) this.callbacks.onCancel();
        });
        this.container.querySelector('#btn-submit-notice').addEventListener('click', async (e) => {
            const title = this.container.querySelector('#new-notice-title').value.trim();
            const bodyHtml = this.quill ? this.quill.root.innerHTML : '';
            if (!title) return alert("공지사항 제목을 입력해주세요.");
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
                e.target.innerText = "공지 등록";
                e.target.disabled = false;
            }
        });
    }

    enableSizeInputs(w, h) {
        w.disabled = false; h.disabled = false;
        w.style.background = "#fff"; h.style.background = "#fff";
    }

    // 📌 유튜브 일반 URL을 삽입용 Embed URL로 자동 변환해주는 편의 함수
    formatVideoUrl(url) {
        if (this.modalState.type !== 'video') return url;
        const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
        if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
        return url;
    }

    // 📌 Cloudinary 업로드 실행
    async executeUpload(file, reqWidth, reqHeight) {
        const range = this.quill.getSelection() || { index: this.quill.getLength() };
        this.quill.insertText(range.index, '[업로드 중...⏳]');
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', this.uploadPreset);

        try {
            const response = await fetch(this.cloudinaryUrl, { method: 'POST', body: formData });
            const result = await response.json();

            if (result.secure_url) {
                this.quill.deleteText(range.index, '[업로드 중...⏳]'.length);
                this.insertIntoQuill(result.secure_url, reqWidth, reqHeight, range.index);
            } else {
                throw new Error('업로드 실패');
            }
        } catch (error) {
            console.error(error);
            this.quill.deleteText(range.index, '[업로드 중...⏳]'.length);
            alert("파일 업로드에 실패했습니다.");
        }
    }

    // 📌 에디터 본문에 미디어 삽입 및 사이즈 강제 적용
    insertIntoQuill(url, width, height, insertIndex = null) {
        const range = insertIndex !== null ? { index: insertIndex } : (this.quill.getSelection() || { index: this.quill.getLength() });
        const embedType = this.modalState.type; // 'image' or 'video'
        
        this.quill.insertEmbed(range.index, embedType, url);
        
        // DOM에 렌더링될 시간을 살짝 준 뒤 속성 부여
        setTimeout(() => {
            const selector = embedType === 'image' ? `img[src="${url}"]` : `iframe[src="${url}"]`;
            const nodes = this.container.querySelectorAll(selector);
            if (nodes.length > 0) {
                const targetNode = nodes[nodes.length - 1];
                targetNode.setAttribute('width', width);
                targetNode.setAttribute('height', height);
                targetNode.style.width = width + 'px';
                targetNode.style.height = height + 'px';
            }
        }, 50);

        this.quill.setSelection(range.index + 1);
    }

    addLinkRow(name = '', url = '') {
        const container = this.container.querySelector('#link-inputs-container');
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
        this.container.querySelector('#new-notice-title').value = title;
        if (this.quill) this.quill.clipboard.dangerouslyPasteHTML(body || '');
        const linkContainer = this.container.querySelector('#link-inputs-container');
        linkContainer.innerHTML = '';
        if (files && files.length > 0) files.forEach(f => this.addLinkRow(f.name, f.url));
        else this.addLinkRow();
    }

    reset() {
        this.container.querySelector('#new-notice-title').value = '';
        if (this.quill) this.quill.setContents([]);
        this.container.querySelector('#link-inputs-container').innerHTML = '';
        this.addLinkRow();
    }
}
