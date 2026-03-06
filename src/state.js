// --- 全モジュール間で共有する変更可能な状態 ---
// このオブジェクトの参照を共有することで、どのモジュールからの変更も他のモジュールに反映される

export const state = {
    cdpConnection: null,
    explicitTargetUrl: null,
    isGenerating: false,
    lastActiveChannel: null,
    lastDiscordActivity: { key: '', at: 0 },
    WORKSPACE_ROOT: null,
    autoApproveMode: false,
    lastApprovalMessage: null
};
