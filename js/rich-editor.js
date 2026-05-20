export class NoticeEditor {
    constructor(containerId, latexGuide, callbacks) {
        this.container = document.getElementById(containerId);
        this.latexGuide = latexGuide;
        this.callbacks = callbacks;
        this.quill = null;
        
        // 💡 Cloudinary 설정 부분 (가입 후 본인의 정보로 변경)
        this.cloudinaryUrl = "https://api.cloudinary.com/v1_1/djryl7blo/image/upload"; 
        this.uploadPreset = "SASAcalender"; 

        // 이미지 리사이징 모달 및 우클릭 메뉴 관련 상태 변수
        this.imgModalState = {
            mode: 'upload', // 'upload' 또는 'edit'
            file: null,     // 업로드 대기 중인 파일
            targetImgNode: null, // 우클릭으로 선택한 이미지 DOM 노드
            ratio: 1        // 원본 이미지의 가로/세로 비율
        };

        this.renderGlobalUI(); // 모달과 우클릭 메뉴를 body에 추가
        this.renderUI();
        this.initQuill();
        this.initEvents();
    }

    // 📌 전역 UI (통합 모달창, 우클릭 메뉴) 렌더링
    renderGlobalUI() {
        if (document.getElementById('quill-custom-img-ui')) return;

        const uiWrapper = document.createElement('div');
        uiWrapper.id = 'quill-custom-img-ui';
        uiWrapper.innerHTML = `
            <div id="quill-img-context-menu" style="display:none; position:fixed; background:#fff; border:1px solid #ccc; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius:4px; z-index:10000; padding:4px 0; font-size:13px; min-width:130px;">
                <div id="menu-item-edit-img" style="padding:8px 12px; cursor:pointer; color:#333; transition: background 0.2s;">⚙️ 이미지 속성 변경</div>
            </div>

            <div id="quill-img-modal" style="display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.4); z-index:10001; align-items:center; justify-content:center;">
                <div style="background:#fff; padding:20px 24px; border-radius:8px; width:300px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                    <h4 style="margin:0 0 15px 0; color:#1a73e8; font-size: 15px;" id="img-modal-title">🖼️ 이미지 업로드 옵션</h4>
                    
                    <div id="img-modal-file-section" style="margin-bottom: 15px;">
                        <label style="font-size:13px; color:#555; font-weight:bold; display:block; margin-bottom:6px;">파일 선택</label>
                        <input type="file" id="img-modal-file-input" accept="image/*" style="font-size:12px; width:100%; border:1px solid #ddd; padding:4px; border-radius:4px; background:#f9f9f9;">
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <label style="font-size:13px; color:#555; font-weight:bold;">가로 (px)</label>
                        <input type="number" id="img-modal-width" style="width:100px; padding:6px; border:1px solid #ddd; border-radius:4px; text-align:right;">
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                        <label style="font-size:13px; color:#555; font-weight:bold;">세로 (px)</label>
                        <input type="number" id="img-modal-height" style="width:100px; padding:6px; border:1px solid #ddd; border-radius:4px; text-align:right;">
                    </div>
                    
                    <div style="margin-bottom:20px; font-size:13px; color:#333;">
                        <label style="cursor:pointer; display:flex; align-items:center; gap:6px;">
                            <input type="checkbox" id="img-modal-lock" checked> 🔒 크기 비율 유지
                        </label>
                    </div>
                    
                    <div style="display:flex; justify-content:flex-end; gap:8px;">
                        <button type="button" id="img-modal-cancel" style="padding:6px 12px; border:1px solid #ddd; background:#f9f9f9; color:#333; border-radius:4px; cursor:pointer; font-size:13px;">취소</button>
                        <button type="button" id="img-modal-confirm" style="padding:6px 12px; border:none; background:#1a73e8; color:#fff; border-radius:4px; cursor:pointer; font-size:13px;">확인</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(uiWrapper);

        const menuBtn = document.getElementById('menu-item-edit-img');
        menuBtn.onmouseover = () => menuBtn.style.background = '#f1f3f4';
        menuBtn.onmouseout = () => menuBtn.style.background = '#fff';
    }

    // 📌 에디터 UI 렌더링
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
                        image: this.imageUploadHandler.bind(this)
                    }
                }
            }
        });
    }

    // 📌 1단계: 에디터 툴바에서 이미지 아이콘 클릭 시 -> 바로 모달 오픈
    imageUploadHandler() {
        if (this.cloudinaryUrl.includes("YOUR_CLOUD_NAME")) return alert("⚠️ Cloudinary 설정 정보를 입력해주세요!");
        this.openImgModal('upload');
    }

    // 📌 2단계: 모달 UI 상태 설정
    openImgModal(mode, targetNode = null, width = '', height = '') {
        this.imgModalState.mode = mode;
        this.imgModalState.targetImgNode = targetNode;
        this.imgModalState.file = null; // 초기화

        const modal = document.getElementById('quill-img-modal');
        const title = document.getElementById('img-modal-title');
        const fileSection = document.getElementById('img-modal-file-section');
        const fileInput = document.getElementById('img-modal-file-input');
        const wInput = document.getElementById('img-modal-width');
        const hInput = document.getElementById('img-modal-height');

        if (mode === 'upload') {
            title.innerText = '🖼️ 이미지 파일 및 크기 지정';
            fileSection.style.display = 'block'; // 파일 선택창 노출
            fileInput.value = ''; // 기존 선택 파일 초기화
            wInput.value = '';
            hInput.value = '';
            // 파일을 선택하기 전까지는 크기 수정 불가
            wInput.disabled = true; 
            hInput.disabled = true; 
            wInput.style.background = "#f1f3f4";
            hInput.style.background = "#f1f3f4";
        } else {
            // 우클릭으로 속성 수정할 때
            title.innerText = '⚙️ 이미지 속성 수정';
            fileSection.style.display = 'none'; // 파일 선택창 숨김
            wInput.value = Math.round(width);
            hInput.value = Math.round(height);
            wInput.disabled = false;
            hInput.disabled = false;
            wInput.style.background = "#fff";
            hInput.style.background = "#fff";
        }

        modal.style.display = 'flex';
    }

    // 📌 이벤트 리스너 통합
    initEvents() {
        const modal = document.getElementById('quill-img-modal');
        const contextMenu = document.getElementById('quill-img-context-menu');
        const fileInput = document.getElementById('img-modal-file-input');
        const wInput = document.getElementById('img-modal-width');
        const hInput = document.getElementById('img-modal-height');
        const lockBtn = document.getElementById('img-modal-lock');

        // [신규] 통합 모달에서 파일 선택 시, 이미지 원본 해상도를 읽어와 입력칸 활성화
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            this.imgModalState.file = file;
            const imgUrl = URL.createObjectURL(file);
            const img = new Image();
            
            img.onload = () => {
                this.imgModalState.ratio = img.width / img.height;
                wInput.value = img.width;
                hInput.value = img.height;
                // 파일이 선택되었으므로 크기 입력칸 활성화
                wInput.disabled = false;
                hInput.disabled = false;
                wInput.style.background = "#fff";
                hInput.style.background = "#fff";
                URL.revokeObjectURL(imgUrl);
            };
            img.src = imgUrl;
        });

        // 실시간 비율 계산 (가로/세로 입력 시 자동 연산)
        wInput.oninput = () => {
            if (lockBtn.checked && wInput.value) {
                hInput.value = Math.round(wInput.value / this.imgModalState.ratio);
            }
        };
        hInput.oninput = () => {
            if (lockBtn.checked && hInput.value) {
                wInput.value = Math.round(hInput.value * this.imgModalState.ratio);
            }
        };

        // 모달창 닫기 버튼
        document.getElementById('img-modal-cancel').onclick = () => {
            modal.style.display = 'none';
        };

        // 모달창 확인 (업로드 또는 수정 실행)
        document.getElementById('img-modal-confirm').onclick = async () => {
            const reqWidth = wInput.value;
            const reqHeight = hInput.value;

            if (this.imgModalState.mode === 'upload') {
                if (!this.imgModalState.file) return alert("이미지 파일을 먼저 선택해주세요.");
                modal.style.display = 'none';
                await this.executeCloudinaryUpload(reqWidth, reqHeight);
            } else if (this.imgModalState.mode === 'edit' && this.imgModalState.targetImgNode) {
                // 우클릭 수정 모드: HTML 속성만 덮어씌움
                modal.style.display = 'none';
                this.imgModalState.targetImgNode.setAttribute('width', reqWidth);
                this.imgModalState.targetImgNode.setAttribute('height', reqHeight);
                this.imgModalState.targetImgNode.style.width = reqWidth + 'px';
                this.imgModalState.targetImgNode.style.height = reqHeight + 'px';
            }
        };

        // 🖱️ 에디터 내부 우클릭 방지 및 커스텀 컨텍스트 메뉴 표시 로직
        const editorContent = this.container.querySelector('.ql-editor');
        editorContent.addEventListener('contextmenu', (e) => {
            if (e.target.tagName === 'IMG') {
                e.preventDefault(); 
                contextMenu.style.display = 'block';
                contextMenu.style.left = e.clientX + 'px';
                contextMenu.style.top = e.clientY + 'px';
                this.imgModalState.targetImgNode = e.target;
            }
        });

        // 우클릭 메뉴의 '이미지 속성 변경' 클릭 시
        document.getElementById('menu-item-edit-img').onclick = () => {
            contextMenu.style.display = 'none';
            const imgNode = this.imgModalState.targetImgNode;
            
            const currentW = parseFloat(imgNode.getAttribute('width') || imgNode.style.width || imgNode.clientWidth);
            const currentH = parseFloat(imgNode.getAttribute('height') || imgNode.style.height || imgNode.clientHeight);
            
            this.imgModalState.ratio = currentW / currentH; 
            this.openImgModal('edit', imgNode, currentW, currentH);
        };

        // 화면 빈 곳 클릭 시 우클릭 메뉴 닫기
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#quill-img-context-menu')) {
                contextMenu.style.display = 'none';
            }
        });

        // 라텍스 가이드 아코디언 토글
        const guideToggle = this.container.querySelector('#latex-guide-toggle');
        guideToggle.addEventListener('click', () => {
            const content = this.container.querySelector('#latex-guide-content');
            const arrow = this.container.querySelector('#latex-guide-arrow');
            if (content.style.display === 'none') {
                if (content.innerHTML.trim() === "") {
                    let html = `<p style="margin-top:0; font-weight: 500; color:#2563eb;">💡 아래 문법을 본문에 입력하면 수식으로 자동 변환됩니다.</p>`;
                    this.latexGuide.forEach(cat => {
                        html += `<h4 style="margin:12px 0 6px 0; color:#1e293b;">📌 ${cat.category}</h4>`;
                        html += `<table style="width:100%; border-collapse:collapse; text-align:left; font-size:12px; margin-bottom:10px;">
                                    <thead>
                                        <tr style="background:#f1f5f9; border-bottom: 2px solid #cbd5e1;">
                                            <th style="padding:6px; width:25%;">설명</th>
                                            <th style="padding:6px; width:45%;">문법 입력</th>
                                            <th style="padding:6px; width:30%;">미리보기</th>
                                        </tr>
                                    </thead>
                                    <tbody>`;
                        cat.inputs.forEach(item => {
                            const safeSyntax = item.syntax.replace(/\\/g, '\\\\');
                            html += `<tr style="border-bottom:1px solid #e2e8f0;">
                                        <td style="padding:6px; font-weight:bold; color:#475569;">${item.desc}</td>
                                        <td style="padding:6px;"><code style="background:#f1f5f9; padding:2px 4px; border-radius:3px; font-family:monospace; color:#ef4444;">${safeSyntax}</code></td>
                                        <td style="padding:6px;">${item.example}</td>
                                     </tr>`;
                        });
                        html += `</tbody></table>`;
                    });
                    content.innerHTML = html;
                    if (window.renderMathInElement) {
                        window.renderMathInElement(content, { delimiters: [{left: "$$", right: "$$", display: true}, {left: "$", right: "$", display: false}] });
                    }
                }
                content.style.display = 'block';
                arrow.style.transform = 'rotate(90deg)';
            } else {
                content.style.display = 'none';
                arrow.style.transform = 'rotate(0deg)';
            }
        });

        // (기존) 첨부파일 링크 및 제출 버튼 로직
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
                alert("공지사항 저장 중 실패가 발생했습니다.");
            } finally {
                e.target.innerText = "공지 등록";
                e.target.disabled = false;
            }
        });
    }

    // 📌 3단계: 실제 Cloudinary 업로드 및 사이즈 적용
    async executeCloudinaryUpload(reqWidth, reqHeight) {
        const range = this.quill.getSelection() || { index: this.quill.getLength() };
        this.quill.insertText(range.index, '[이미지 업로드 중...⏳]');
        
        const formData = new FormData();
        formData.append('file', this.imgModalState.file);
        formData.append('upload_preset', this.uploadPreset);

        try {
            const response = await fetch(this.cloudinaryUrl, { method: 'POST', body: formData });
            const result = await response.json();

            if (result.secure_url) {
                this.quill.deleteText(range.index, '[이미지 업로드 중...⏳]'.length);
                
                // Quill 에디터에 이미지 삽입
                this.quill.insertEmbed(range.index, 'image', result.secure_url);
                
                // 💡 HTML width/height 속성 강제 주입
                setTimeout(() => {
                    const imgs = this.container.querySelectorAll(`img[src="${result.secure_url}"]`);
                    if (imgs.length > 0) {
                        const targetImg = imgs[imgs.length - 1];
                        targetImg.setAttribute('width', reqWidth);
                        targetImg.setAttribute('height', reqHeight);
                        targetImg.style.width = reqWidth + 'px';
                        targetImg.style.height = reqHeight + 'px';
                    }
                }, 50);

                this.quill.setSelection(range.index + 1);
            } else {
                throw new Error('업로드 실패');
            }
        } catch (error) {
            console.error(error);
            this.quill.deleteText(range.index, '[이미지 업로드 중...⏳]'.length);
            alert("이미지 업로드에 실패했습니다.");
        }
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
