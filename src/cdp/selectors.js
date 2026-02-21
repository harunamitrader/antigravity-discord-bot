
export const SELECTORS = {
    // Chat Input: targeted by role and excluding terminal helpers
    CHAT_INPUT: 'div[role="textbox"]:not(.xterm-helper-textarea)',

    // Submit Button: Look for a button that likely submits, containing an arrow icon
    // Using a broad selector for the button wrapper, then verifying SVG inside in JS
    SUBMIT_BUTTON_CONTAINER: 'button',
    SUBMIT_BUTTON_SVG_CLASSES: ['lucide-arrow-right', 'lucide-arrow-up', 'lucide-send'],

    // Approval Buttons
    APPROVAL_KEYWORDS: [
        'run', 'approve', 'allow', 'yes', 'accept', 'confirm',
        'save', 'apply', 'create', 'update', 'delete', 'remove', 'submit', 'send', 'retry', 'continue',
        'always allow', 'allow once', 'allow this conversation',
        '実行', '許可', '承認', 'はい', '同意', '保存', '適用', '作成', '更新', '削除', '送信', '再試行', '続行'
    ],
    CANCEL_KEYWORDS: ['cancel', 'reject', 'deny', 'ignore', 'キャンセル', '拒否', '無視', 'いいえ', '不許可'],

    // Context
    CONTEXT_URL_KEYWORD: 'cascade-panel'
};
