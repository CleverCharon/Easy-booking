import { Form, Input, Select, Space } from 'antd'
import { countryCodes } from '../data/countryCodes'

// 国旗 URL：Vite 使用 import.meta.glob 预加载
const flagUrlMap: Record<string, string> = {}
const flagGlob = import.meta.glob('../img/country/*.png', { eager: true }) as Record<string, { default?: string }>
Object.entries(flagGlob).forEach(([path, mod]) => {
  const name = path.replace(/^.*\/([^/]+)\.png$/, '$1')
  if (mod?.default) flagUrlMap[name] = mod.default
})
function getFlagUrl(flagFile: string): string {
  const key = flagFile.replace(/\.png$/, '')
  return flagUrlMap[key] ?? flagUrlMap['China'] ?? ''
}

export function PhoneFields(props: {
  codeName: string
  numberName: string
  codeInitial?: string
  numberPlaceholder?: string
  codeRules?: Parameters<typeof Form.Item>[0]['rules']
  numberRules?: Parameters<typeof Form.Item>[0]['rules']
}) {
  const { codeName, numberName, codeInitial = '+86', numberPlaceholder = '请输入手机号', codeRules, numberRules } = props
  return (
    <Space.Compact className="w-full flex" size="middle">
      <div className="w-1/3 shrink-0">
        <Form.Item name={codeName} noStyle initialValue={codeInitial} rules={codeRules}>
          <Select
            size="large"
            className="rounded-lg w-full"
            optionLabelProp="label"
            options={countryCodes.map((c) => ({
              value: c.code,
              flagFile: c.flagFile,
              name: c.name,
              label: (
                <span className="flex items-center gap-1">
                  <img src={getFlagUrl(c.flagFile)} alt="" className="h-4 w-6 object-contain" />
                  <span>{c.code}</span>
                </span>
              ),
            }))}
            optionRender={({ data }: { data: { value: string; flagFile?: string; name?: string } }) => (
              <span className="flex items-center gap-2">
                <img src={getFlagUrl(data.flagFile ?? 'China.png')} alt="" className="h-4 w-6 object-contain" />
                <span>{data.value}</span>
                <span className="text-gray-400 text-sm">{data.name}</span>
              </span>
            )}
          />
        </Form.Item>
      </div>
      <div className="w-2/3 shrink-0">
        <Form.Item name={numberName} noStyle rules={numberRules}>
          <Input placeholder={numberPlaceholder} size="large" className="rounded-lg w-full" />
        </Form.Item>
      </div>
    </Space.Compact>
  )
}

