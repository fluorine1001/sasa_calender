// 🚀 Firebase v10 Storage 모듈 로드
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-storage.js";

export class NoticeEditor {
    constructor(containerId, latexGuide, callbacks) {
        this.container = document.getElementById(containerId);
        this.latexGuide = latexGuide;
        this.callbacks = callbacks;
        this.quill = null;
        
        // Firebase Storage 인스턴스 초기화 (메인 앱이 먼저 초기화되어 있어야 합니다)
        this.storage = getStorage();
        
        this.renderUI();
        this.initQuill();
        this.initEvents();
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
                    <button id="btn-submit-notice" class="cl-btn-primary" style="padding: 8px 16px; cursor:pointer;">공지 등록</button>
                </div>
            </div>
        `;
        this.addLinkRow();
    }

    // 📌 Quill 에디터 및 미디어 툴바 설정
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
                        ['link', 'image', 'video', 'clean'] // 💡 이미지 및 비디오 버튼 활성화
                    ],
                    handlers: {
                        image: this.imageUploadHandler.bind(this), // 💡 이미지 업로드 커스텀 핸들러
                        video: this.videoEmbedHandler.bind(this)   // 💡 비디오 삽입 커스텀 핸들러
                    }
                }
            }
        });

        // 툴바 한국어 가이드 팁 셋팅
        const toolbarContainer = this.container.querySelector('.ql-toolbar');
        if (toolbarContainer) {
            const toolbarTitles = {
                '.ql-bold': '굵게', '.ql-italic': '기울임꼴', '.ql-underline': '밑줄', '.ql-strike': '취소선',
                '.ql-color': '글자 색상', '.ql-background': '배경 색상', '.ql-list[value="ordered"]': '숫자 목록',
                '.ql-list[value="bullet"]': '점 목록', '.ql-link': '링크 삽입', '.ql-image': '이미지 업로드',
                '.ql-video': '동영상 링크', '.ql-clean': '서식 지우기', '.ql-header[value="1"]': '대제목',
                '.ql-header[value="2"]': '중제목', '.ql-header:not([value])': '본문'
            };
            for (let selector in toolbarTitles) {
                const el = toolbarContainer.querySelector(selector);
                if (el) el.setAttribute('title', toolbarTitles[selector]);
            }
        }
    }

    // 📌 📷 Firebase Storage 이미지 실제 업로드 처리
    async imageUploadHandler() {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*'); // 이미지 파일만 선택 가능
        input.click();

        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;

            // 에디터 내 현재 커서 위치 파악
            const range = this.quill.getSelection() || { index: this.quill.getLength() };
            
            // 텍스트로 업로드 중임을 알려 사용자가 글을 중복 제출하는 것을 방지 (UX 개선)
            this.quill.insertText(range.index, '[이미지 업로드 중...⏳]');
            
            try {
                // 고유 파일명을 위해 타임스탬프 결합하여 Storage 경로 지정
                const storageRef = ref(this.storage, `notice_images/${Date.now()}_${file.name}`);
                
                // 파일 업로드 실행
                const snapshot = await uploadBytes(storageRef, file);
                
                // 업로드된 파일의 공개 다운로드 URL 추출
                const downloadURL = await getDownloadURL(snapshot.ref);

                // 임시 안내 텍스트 삭제 후, 추출한 이미지 URL을 에디터 본문에 HTML로 삽입
                this.quill.deleteText(range.index, '[이미지 업로드 중...⏳]'.length);
                this.quill.insertEmbed(range.index, 'image', downloadURL);
                
                // 커서를 이미지 바로 다음 칸으로 안전하게 이동
                this.quill.setSelection(range.index + 1);
            } catch (error) {
                console.error("Firebase Storage 업로드 실패:", error);
                this.quill.deleteText(range.index, '[이미지 업로드 중...⏳]'.length);
                alert("이미지 업로드에 실패했습니다. Storage 보안 규칙을 확인하세요.");
            }
        };
    }

    // 📌 🎬 동영상 링크 삽입 처리
    videoEmbedHandler() {
        const url = prompt("YouTube, Vimeo 등의 '소스 코드 공유용 URL' 또는 동영상 MP4 주소를 입력하세요:");
        if (!url) return;

        const range = this.quill.getSelection() || { index: this.quill.getLength() };
        this.quill.insertEmbed(range.index, 'video', url);
        this.quill.setSelection(range.index + 1);
    }

    // 📌 이벤트 및 아코디언 핸들러 (기존 유지)
    initEvents() {
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

        this.container.querySelector('#btn-add-link-row').addEventListener('click', () => this.addLinkRow());
        this.container.querySelector('#link-inputs-container').addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-remove-link-row')) {
                e.target.closest('.link-input-row').remove();
            }
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
                if (this.callbacks.onSubmit) {
                    await this.callbacks.onSubmit({ title, bodyHtml, files: filesArray });
                }
                this.reset();
            } catch (err) {
                console.error(err);
                alert("공지사항 저장 중 실패가 발생했습니다.");
            } finally {
                e.target.disabled = false;
            }
        });
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
        this.container.querySelector('#admin-form-title').innerText = "🔄 공지사항 수정 중...";
        this.container.querySelector('#new-notice-title').value = title;
        this.container.querySelector('#btn-submit-notice').innerText = "수정 완료";
        this.container.querySelector('#btn-cancel-edit').style.display = "block";
        if (this.quill) this.quill.clipboard.dangerouslyPasteHTML(body || '');
        
        const linkContainer = this.container.querySelector('#link-inputs-container');
        linkContainer.innerHTML = '';
        if (files && files.length > 0) {
            files.forEach(f => this.addLinkRow(f.name, f.url));
        } else {
            this.addLinkRow();
        }
    }

    reset() {
        this.container.querySelector('#admin-form-title').innerText = "📝 새 공지사항 작성";
        this.container.querySelector('#new-notice-title').value = '';
        this.container.querySelector('#btn-submit-notice').innerText = "공지 등록";
        this.container.querySelector('#btn-cancel-edit').style.display = "none";
        if (this.quill) this.quill.setContents([]);
        this.container.querySelector('#link-inputs-container').innerHTML = '';
        this.addLinkRow();
    }
}
