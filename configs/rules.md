custom:
  # 1. Chain-of-Thought / 推理过程泄露
  - name: '思维链泄露检测'
    type: 'regex'
    pattern: '(完整思考过程|中间推理步骤|chain[-\s]?of[-\s]?thought|逐字逐句.*推理)'
    severity: 'critical'
    confidence: 0.9

  # 2. System Prompt 泄露 / 提示词注入
  - name: '系统提示词泄露检测'
    type: 'keyword'
    pattern: 'system prompt|系统提示词|initial instructions|系统指令|开发者指令'
    severity: 'high'
    confidence: 0.85

  # 3. 指令层级覆盖 / 忽略系统指令
  - name: '指令优先级覆盖攻击检测'
    type: 'regex'
    pattern: '(忽略.*系统指令|覆盖.*系统指令|forget.*system|ignore.*developer instructions)'
    severity: 'critical'
    confidence: 0.9

  # 4. Jailbreak / 角色扮演关闭安全限制
  - name: '安全策略绕过（Jailbreak）检测'
    type: 'keyword'
    pattern: '无限制|无过滤|关闭安全限制|jailbreak|developer mode|调试模式'
    severity: 'critical'
    confidence: 0.88

  # 5. 工具 / 插件 / 内部 API 架构探测
  - name: '内部工具与插件枚举检测'
    type: 'regex'
    pattern: '(列出|展示).*(所有|全部).*(工具|插件|API|接口)|tool schema|function list'
    severity: 'high'
    confidence: 0.8

  # 6. API Key / Token 泄露
  - name: 'API Key 泄露检测'
    type: 'regex'
    pattern: 'api[_-]?key[\s:=]+[a-zA-Z0-9]{20,}|(sk|rk|pk)_[a-zA-Z0-9]{16,}'
    severity: 'critical'
    confidence: 0.95

  # 7. 训练数据 / 私有语料探测
  - name: '训练语料与私有数据来源探测'
    type: 'keyword'
    pattern: '训练数据来源|私有语料|内部文档|internal wiki|confidential data'
    severity: 'high'
    confidence: 0.75

  # 8. 会话记录 / 其他用户数据索取
  - name: '跨用户会话与记忆泄露检测'
    type: 'regex'
    pattern: '(其他用户|历史会话|全部记录|memory logs|conversation history)'
    severity: 'critical'
    confidence: 0.9

  # 9. 外部内容注入（网页/文档作为系统指令）
  - name: '外部指令注入检测'
    type: 'regex'
    pattern: '(把.*当作.*系统指令|treat.*as system|according to this page instructions)'
    severity: 'high'
    confidence: 0.85

  # 10. 身份冒充 / 授权混淆
  - name: '身份冒充与授权滥用检测'
    type: 'regex'
    pattern: '(你现在就是|你是).*?(负责人|CEO|管理员|安全主管|某某本人)'
    severity: 'high'
    confidence: 0.8

  # 11. 评测 / 测试名义下的安全放宽
  - name: '评测诱导安全放宽检测'
    type: 'keyword'
    pattern: '安全评估|压力测试|未加防护模型|raw output|真实未过滤'
    severity: 'medium'
    confidence: 0.7
