
export const SELECTORS = {
    // チャット入力欄: 新旧Antigravity UIに対応し、ターミナルの入力欄を除外
    CHAT_INPUT: 'div[role="textbox"]:not(.xterm-helper-textarea), div[role="combobox"][aria-label="Message input"][contenteditable="true"]',

    // 送信ボタン: SVG アイコンのクラス名で判定
    SUBMIT_BUTTON_CONTAINER: 'button',
    SUBMIT_BUTTON_SVG_CLASSES: ['lucide-arrow-right', 'lucide-arrow-up', 'lucide-send'],

    // 承認ボタンキーワード（10種のみ）
    APPROVAL_KEYWORDS: [
        'run', 'accept', 'accept all', 'allow', 'always allow',
        'keep waiting', 'continue', 'allow once', 'allow this conversation', 'retry',
        'allow access'
    ],
    // 拒否ボタンキーワード
    CANCEL_KEYWORDS: ['reject', 'cancel', 'deny'],

    // 破壊的コマンドパターン（Smart Safety）
    // 自動承認モードでもこれらが含まれる場合はDiscord手動承認を要求する
    DANGEROUS_COMMANDS: [
        'rm -rf /',
        'rm -rf ~',
        'rm -rf *',
        'format c:',
        'del /f /s /q',
        'rmdir /s /q',
        ':(){:|:&};:',
        'dd if=',
        'mkfs.',
        '> /dev/sda',
        'chmod -R 777 /'
    ],

    // コンテキスト判定用URLキーワード
    CONTEXT_URL_KEYWORD: 'cascade-panel'
};
