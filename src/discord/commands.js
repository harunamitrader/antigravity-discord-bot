export const commands = [
    {
        name: 'help',
        description: 'Antigravity Bot コマンド一覧を表示',
    },
    {
        name: 'screenshot',
        description: 'Antigravityのスクリーンショットを取得',
    },
    {
        name: 'stop',
        description: 'AIの生成を停止',
    },
    {
        name: 'newchat',
        description: '新規チャットを作成',
    },
    {
        name: 'title',
        description: '現在のチャットタイトルを表示',
    },
    {
        name: 'status',
        description: '現在のモデルとモードを表示',
    },
    {
        name: 'model',
        description: 'モデル一覧表示または切替',
        options: [
            {
                name: 'number',
                description: '切り替えるモデルの番号 (未指定で一覧表示)',
                type: 4,
                required: false,
            }
        ]
    },
    {
        name: 'mode',
        description: 'モード (Planning/Fast) を表示または切替',
        options: [
            {
                name: 'target',
                description: '切り替えるモード (planning または fast)',
                type: 3,
                required: false,
                choices: [
                    { name: 'Planning', value: 'planning' },
                    { name: 'Fast', value: 'fast' }
                ]
            }
        ]
    },
    {
        name: 'template',
        description: 'よく使うプロンプトを登録・呼び出しします',
        options: [
            {
                name: 'use',
                description: '登録されたテンプレートを使用します',
                type: 1,
                options: [{ name: 'name', description: 'テンプレート名', type: 3, required: true }]
            },
            {
                name: 'add',
                description: '新しいテンプレートを登録します',
                type: 1,
                options: [
                    { name: 'name', description: 'テンプレート名', type: 3, required: true },
                    { name: 'text', description: '登録するプロンプトの内容', type: 3, required: true }
                ]
            },
            {
                name: 'list',
                description: '登録されているテンプレート一覧を表示します',
                type: 1
            },
            {
                name: 'delete',
                description: 'テンプレートを削除します',
                type: 1,
                options: [{ name: 'name', description: '削除するテンプレート名', type: 3, required: true }]
            }
        ]
    },
    {
        name: 'schedule',
        description: '指定した日時にプロンプトを自動実行します',
        options: [
            {
                name: 'add',
                description: '新しいスケジュールを登録します',
                type: 1,
                options: [
                    { name: 'name', description: 'スケジュール名', type: 3, required: true },
                    { name: 'cron', description: '実行日時 (cron式 または YYYY-MM-DD HH:mm)', type: 3, required: true },
                    { name: 'text', description: '実行するプロンプト', type: 3, required: true }
                ]
            },
            {
                name: 'list',
                description: '登録されているスケジュール一覧を表示します',
                type: 1
            },
            {
                name: 'delete',
                description: 'スケジュールを削除します',
                type: 1,
                options: [{ name: 'name', description: '削除するスケジュール名', type: 3, required: true }]
            }
        ]
    },
    {
        name: 'workspace',
        description: 'Antigravityのワークスペースをチャンネルに紐づけます',
        options: [
            {
                name: 'list',
                description: '現在開いているAntigravityの一覧を表示します',
                type: 1
            },
            {
                name: 'bind',
                description: 'このチャンネルを特定のワークスペースに紐づけます',
                type: 1,
                options: [{ name: 'number', description: '紐づけるワークスペースの番号', type: 4, required: true }]
            }
        ]
    }
];
