// js/rich-editor.js

export class NoticeEditor {
    /**
     * @param {string} containerId - 에디터가 그려질 부모 요소의 ID
     * @param {Array} latexGuideData - 수식 가이드 배열 데이터
     * @param {Object} callbacks - { onSubmit: (data) => {}, onCancel: () => {} }
     */
    constructor(containerId, latexGuideData, callbacks) {
        this.container = document.getElementById(containerId);
        this.latexGuideData = latexGuideData;
        this.callbacks = callbacks || {};
        this.quillEditor = null;
        
        this.initUI();
    }

    // 📌 에디터 화면 렌더링 및 Quill 초기화
    initUI() {
        this.container.style.cssText = "padding: 15px; margin-bottom: 20px; background: #fdfdfd; border: 1px dashed #1a73e8; border-radius: 6px; display: flex; flex-direction: column; gap: 8px;";
        
        this.container.innerHTML = `
            <div style="font-weight:bold; color:#1a73e8; font-size:14px; margin-bottom:5px;" id="admin-form-title">📝 새 글 작성</div>
            <input type="text" id="new-notice-title" placeholder="제목을 입력하세요" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
            
            <div id="editor-wrapper" style="background:#fff; border-radius:4px;">
                <div id="new-notice-editor" style="height: 150px; font-size: 14px;"></div>
            </div>
            
            <div style="border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; margin-top: 4px;">
                <div id="latex-guide-toggle" style="background: #f8fafc; padding: 8px 12px; font-size: 13px; font-weight: bold; color: #475569; cursor: pointer; display: flex; justify-content: space-between; align-items: center; user-select: none;">
                    <span>📐 LaTeX 수식 작성 문법 가이드 보기</span>
                    <span id="latex-guide-arrow" style="transition: transform 0.2s;">▶</span>
                </div>
                <div id="latex-guide-content" style="display: none; padding: 12px; background: #ffffff; font-size: 13px; border-top: 1px solid #e2e8f0; line-height: 1.6; max-height: 250px; overflow-y: auto;"></div>
            </div>
            
            <div style="font-weight:bold; font-size:12px; color:#555; margin-top:10px;">📎 첨부 파일 / 링크</div>
            <div id="link-inputs-container" style="display:flex; flex-direction:column; gap:8px;"></div>
            
            <div style="display:flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                <button type="button" id="btn-add-link-row" style="background:none; border:1px solid #5f6368; color:#5f6368; border-radius:4px; padding:6px 12px; font-size:12px; cursor:pointer;">+ 링크 추가</button>
                <div style="display:flex; gap:10px;">
                    <button type="button" id="btn-cancel-edit" style="display:none; background:#f1f3f4; color:#333; border:none; border-radius:4px; padding: 8px 16px; cursor:pointer;">취소</button>
                    <button type="button" id="btn-submit-notice" class="cl-btn-primary" style="padding: 8px 16px; cursor:pointer;">등록</button>
                </div>
            </div>
        `;

        if (window.Quill) {
            this.quillEditor = new Quill(this.container.querySelector('#new-notice-editor'), {
                theme: 'snow',
                placeholder: '본문 내용을 입력하세요 (수식 가이드 참조)',
                modules: {
                    toolbar: [
                        [{ 'header': [1, 2, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'color': [] }, { 'background': [] }],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        ['link', 'clean']
                    ]
                }
            });
        }
        
        this.setupEvents();
        this.addLinkRow();
    }

    // 📌 컴포넌트 내부 이벤트 리스너 바인딩
    setupEvents() {
        // 가이드 토글
        const guideToggle = this.container.querySelector('#latex-guide-toggle');
        guideToggle.addEventListener('click', () => {
            const content = this.container.querySelector('#latex-guide-content');
            const arrow = this.container.querySelector('#latex-guide-arrow');
            if (content.style.display === 'none') {
                if (content.innerHTML.trim() === "") this.renderGuide(content);
                content.style.display = 'block';
                arrow.style.transform = 'rotate(90deg)';
            } else {
                content.style.display = 'none';
                arrow.style.transform = 'rotate(0deg)';
            }
        });

        // 링크 추가/삭제
        this.container.querySelector('#btn-add-link-row').addEventListener('click', () => this.addLinkRow());
        this.container.querySelector('#link-inputs-container').addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-remove-link-row')) e.target.closest('.link-input-row').remove();
        });

        // 외부 제출 콜백 실행
        this.container.querySelector('#btn-submit-notice').addEventListener('click', async (e) => {
            const btn = e.target;
            const data = this.getData();
            if (!data.title) return alert("제목을 입력해주세요.");
            
            btn.innerText = "저장 중...";
            btn.disabled = true;
            try {
                if (this.callbacks.onSubmit) await this.callbacks.onSubmit(data);
                this.reset();
            } catch (err) {
                console.error("에디터 저장 에러:", err);
                alert("저장 중 오류가 발생했습니다.");
            } finally {
                btn.innerText = "등록";
                btn.disabled = false;
            }
        });

        // 외부 취소 콜백 실행
        this.container.querySelector('#btn-cancel-edit').addEventListener('click', () => {
            this.reset();
            if (this.callbacks.onCancel) this.callbacks.onCancel();
        });
    }

    // 📌 가이드 동적 렌더링
    renderGuide(content) {
        let html = `<p style="margin-top:0; font-weight: 500; color:#2563eb;">💡 아래 문법을 본문에 입력하면 수식으로 자동 변환됩니다.</p>`;
        (this.latexGuideData || []).forEach(cat => {
            html += `<h4 style="margin:12px 0 6px 0; color:#1e293b;">📌 ${cat.category}</h4>
                     <table style="width:100%; border-collapse:collapse; text-align:left; font-size:12px; margin-bottom:10px;">
                        <thead><tr style="background:#f1f5f9; border-bottom: 2px solid #cbd5e1;"><th style="padding:6px; width:25%;">설명</th><th style="padding:6px; width:45%;">문법 입력</th><th style="padding:6px; width:30%;">미리보기</th></tr></thead><tbody>`;
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
        if (window.renderMathInElement) window.renderMathInElement(content, { delimiters: [{left: "$$", right: "$$", display: true}, {left: "$", right: "$", display: false}] });
    }

    addLinkRow(name = '', url = '') {
        const container = this.container.querySelector('#link-inputs-container');
        const row = document.createElement('div');
        row.className = 'link-input-row';
        row.style.cssText = 'display:flex; gap: 10px; align-items:center;';
        row.innerHTML = `
            <input type="text" class="link-file-name" placeholder="링크 이름" value="${name}" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; width: 30%;">
            <input type="url" class="link-file-url" placeholder="URL (http://...)" value="${url}" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; flex:1;">
            <button type="button" class="btn-remove-link-row" style="background:none; border:none; cursor:pointer; color:#d93025; font-size:16px; flex-shrink:0;">✕</button>
        `;
        container.appendChild(row);
    }

    // 📌 작성된 데이터 추출
    getData() {
        const title = this.container.querySelector('#new-notice-title').value.trim();
        const bodyHtml = this.quillEditor ? this.quillEditor.root.innerHTML : '';
        const filesArray = [];
        this.container.querySelectorAll('.link-input-row').forEach(row => {
            const name = row.querySelector('.link-file-name').value.trim();
            const url = row.querySelector('.link-file-url').value.trim();
            if (url) filesArray.push({ name: name || '첨부 링크 열기', url: url });
        });
        return { title, bodyHtml, files: filesArray };
    }

    // 📌 수정 모드를 위한 데이터 주입
    setData(title, bodyHtml, files) {
        this.container.querySelector('#admin-form-title').innerText = "🔄 글 수정 중...";
        this.container.querySelector('#new-notice-title').value = title;
        this.container.querySelector('#btn-submit-notice').innerText = "수정 완료";
        this.container.querySelector('#btn-cancel-edit').style.display = "block";
        
        if (this.quillEditor) this.quillEditor.clipboard.dangerouslyPasteHTML(bodyHtml || '');
        
        const linkContainer = this.container.querySelector('#link-inputs-container');
        linkContainer.innerHTML = '';
        if (files && files.length > 0) files.forEach(f => this.addLinkRow(f.name, f.url));
        else this.addLinkRow();
    }

    // 📌 에디터 초기화
    reset() {
        this.container.querySelector('#admin-form-title').innerText = "📝 새 글 작성";
        this.container.querySelector('#new-notice-title').value = '';
        this.container.querySelector('#btn-submit-notice').innerText = "등록";
        this.container.querySelector('#btn-cancel-edit').style.display = "none";
        if (this.quillEditor) this.quillEditor.setContents([]);
        this.container.querySelector('#link-inputs-container').innerHTML = '';
        this.addLinkRow();
    }
}
