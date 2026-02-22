import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Form, Input, InputNumber, Button, Card, Space, Upload, Cascader, Select, Checkbox } from 'antd'
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined, PictureOutlined } from '@ant-design/icons'
import PageLayout from '../../components/PageLayout'
import { createHotel, updateHotel, getHotelDetail } from '../../api/hotels'
import { getAdminHotelDetail } from '../../api/admin'
import { uploadFile } from '../../api/request'
import { toast } from '../../utils/toast'
import { getUser } from '../../utils/auth'
import { chinaRegions } from '../../data/regions'
import { countryCodes } from '../../data/countryCodes'

/** 待上传的房型图（提交时再上传 OSS） */
type PendingRoomImage = { file: File; objectUrl: string }

interface HotelFormValues {
  name: string
  city: string
  address: string
  phoneCode?: string
  phoneNumber?: string
  price?: number
  star_level?: number
  tagList?: string[]
  image_url?: string
  description?: string
  roomTypes: Array<{ name: string; price: number; description?: string; image_url?: string }>
}

/** 根据城市名反查省/市级联值（用于回填 Cascader） */
function getCascadeValueFromCity(city: string | undefined): string[] {
  if (!city || !city.trim()) return []
  const s = city.trim()
  for (const prov of chinaRegions) {
    if (prov.value === s) return [s]
    const child = prov.children?.find((c) => c.value === s)
    if (child) return [prov.value, child.value]
  }
  return []
}

/** 从数据库电话字符串解析区号与号码 */
function parsePhone(phone: string | undefined): { code: string; number: string } {
  if (!phone || !phone.trim()) return { code: '+86', number: '' }
  const t = phone.trim()
  const match = t.match(/^(\+\d{1,4})\s*(.*)$/)
  if (match) return { code: match[1], number: (match[2] || '').trim() }
  return { code: '+86', number: t }
}

/** 国旗 URL：Vite 使用 import.meta.glob 预加载 */
const flagUrlMap: Record<string, string> = {}
const flagGlob = import.meta.glob('../../img/country/*.png', { eager: true }) as Record<string, { default?: string }>
Object.entries(flagGlob).forEach(([path, mod]) => {
  const name = path.replace(/^.*\/([^/]+)\.png$/, '$1')
  if (mod?.default) flagUrlMap[name] = mod.default
})
function getFlagUrl(flagFile: string): string {
  const key = flagFile.replace(/\.png$/, '')
  return flagUrlMap[key] ?? flagUrlMap['China'] ?? ''
}

const COVER_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'
const ROOM_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

const defaultRoomType = { name: '', price: undefined as unknown as number, description: '', image_url: '' }
const TAG_OPTIONS = [
  '免费停车',
  '含早餐',
  '免费 Wi-Fi',
  '亲子友好',
  '近地铁',
  '商务出行',
  '可开发票',
  '健身房',
  '游泳池',
  '海景房',
  '山景房',
  '会议室',
]

export default function HotelPublishPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('id') ? parseInt(searchParams.get('id')!, 10) : null
  const viewOnly = searchParams.get('view') === '1' && !!editId
  const fromAdmin = searchParams.get('from') === 'admin' && getUser()?.role === 'admin'
  const readOnly = viewOnly || fromAdmin
  const [form] = Form.useForm<HotelFormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(!!editId)
  /** 封面图：选择后暂存文件，提交时再上传 */
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null)
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null)
  const coverPreviewUrlRef = useRef<string | null>(null)
  /** 房型图：按 Form.List 的 name 索引，提交时再上传 */
  const [pendingRoomFiles, setPendingRoomFiles] = useState<Record<number, PendingRoomImage[]>>({})
  const pendingRoomFilesRef = useRef<Record<number, PendingRoomImage[]>>({})
  pendingRoomFilesRef.current = pendingRoomFiles
  /** 详情中的状态与原因（用于只读时展示下线原因/拒绝原因） */
  const [detailStatus, setDetailStatus] = useState<number | null>(null)
  const [detailCancellation, setDetailCancellation] = useState<string | null>(null)

  const setCoverPreview = (file: File | null) => {
    if (coverPreviewUrlRef.current) {
      URL.revokeObjectURL(coverPreviewUrlRef.current)
      coverPreviewUrlRef.current = null
    }
    if (file) {
      const url = URL.createObjectURL(file)
      coverPreviewUrlRef.current = url
      setCoverPreviewUrl(url)
    } else {
      setCoverPreviewUrl(null)
    }
  }

  useEffect(() => {
    return () => {
      if (coverPreviewUrlRef.current) URL.revokeObjectURL(coverPreviewUrlRef.current)
      Object.values(pendingRoomFilesRef.current).forEach((arr) => arr.forEach((p) => URL.revokeObjectURL(p.objectUrl)))
    }
  }, [])

  useEffect(() => {
    if (!editId || isNaN(editId)) return
    setLoadingDetail(true)
    const fetchDetail = fromAdmin ? getAdminHotelDetail(editId) : getHotelDetail(editId)
    fetchDetail
      .then((detail) => {
        setDetailStatus(detail.status ?? null)
        setDetailCancellation(detail.cancellation ?? null)
        setPendingCoverFile(null)
        setCoverPreview(null)
        setPendingRoomFiles({})
        const { code, number } = parsePhone(detail.phone ?? undefined)
        const tagList = detail.tags ? detail.tags.split(/[\uFF0C,]/).map((s) => s.trim()).filter(Boolean) : []
        form.setFieldsValue({
          name: detail.name,
          city: detail.city,
          address: detail.address,
          phoneCode: code,
          phoneNumber: number,
          price: detail.price ?? undefined,
          star_level: detail.star_level ?? undefined,
          tagList,
          image_url: detail.image_url ?? undefined,
          description: detail.description ?? undefined,
          roomTypes: (detail.roomTypes && detail.roomTypes.length > 0)
            ? detail.roomTypes.map((rt) => ({
                name: rt.name,
                price: rt.price,
                description: rt.description ?? undefined,
                image_url: rt.image_url ?? undefined,
              }))
            : [defaultRoomType],
        })
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : '加载失败')
        navigate('/hotels', { replace: true })
      })
      .finally(() => setLoadingDetail(false))
  }, [editId, form, navigate, fromAdmin])

  const onFinish = async (values: HotelFormValues) => {
    const roomTypes = (values.roomTypes || []).filter((rt) => rt.name && rt.price != null)
    if (roomTypes.length === 0) {
      toast.error('请至少添加一个房型（填写房型名称和价格）')
      return
    }
    setSubmitting(true)
    try {
      let coverUrl = values.image_url
      if (pendingCoverFile) {
        const res = await uploadFile(pendingCoverFile)
        if (res.url) coverUrl = res.url
        else throw new Error(res.message || '封面上传失败')
      }
      const roomTypeUrls: string[] = []
      for (let i = 0; i < roomTypes.length; i++) {
        const existing = (roomTypes[i].image_url || '').split(',').filter(Boolean)
        const pending = pendingRoomFiles[i] || []
        const uploaded = await Promise.all(pending.map((p) => uploadFile(p.file).then((r) => r.url)))
        const all = [...existing, ...uploaded.filter(Boolean)] as string[]
        roomTypeUrls.push(all.join(','))
      }
      const phone = [values.phoneCode || '', (values.phoneNumber || '').trim()].filter(Boolean).join('') || undefined
      const normalizedTagList: string[] = Array.isArray(values.tagList) ? values.tagList : []
      const tags = normalizedTagList.map((t: string) => t.trim()).filter(Boolean).join('\uFF0C') || undefined
      const payload = {
        name: values.name,
        city: values.city,
        address: values.address,
        phone,
        price: values.price,
        star_level: values.star_level,
        tags,
        image_url: coverUrl,
        description: values.description,
        roomTypes: roomTypes.map((rt, i) => ({
          name: rt.name,
          price: rt.price,
          description: rt.description,
          image_url: roomTypeUrls[i] || rt.image_url,
        })),
      }
      if (editId) {
        await updateHotel(editId, payload)
        toast.success('更新成功')
      } else {
        await createHotel(payload)
        toast.success('发布成功')
      }
      setPendingCoverFile(null)
      setCoverPreview(null)
      setPendingRoomFiles({})
      navigate('/hotels', { replace: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : editId ? '更新失败' : '发布失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageLayout semiTransparent maxWidth="900px">
      <div className="p-8 pb-10">
        <div className="flex items-center justify-between mb-6">
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            className="text-[#2c4fa3] font-medium"
            onClick={() => navigate(fromAdmin ? '/admin' : '/hotels')}
          >
            {fromAdmin ? '返回管理页' : viewOnly ? '返回申请列表' : '返回列表'}
          </Button>
          <h1 className="m-0 text-[24px] font-semibold text-gray-800 tracking-tight">
            {viewOnly || fromAdmin ? '查看信息' : editId ? '编辑酒店' : '发布酒店'}
          </h1>
          <span className="w-20" />
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ roomTypes: [defaultRoomType], 
                           phoneCode: '+86', 
                           tagList: [] 
                          }}
          className="[&_.ant-form-item]:mb-6 [&_.ant-form-item-label]:pb-1 [&_.ant-form-item-label_label]:text-gray-700 [&_.ant-form-item-label_label]:font-medium"
          disabled={loadingDetail || readOnly}
        >
          <Card title="基础信息" className="mb-6 rounded-xl shadow-sm">
            <Form.Item name="name" label="酒店名称" rules={[{ required: true, message: '请输入酒店名称' }]}>
              <Input placeholder="请输入酒店名称" size="large" className="rounded-lg" />
            </Form.Item>
            <Form.Item name="city" label="所在城市" rules={[{ required: true, message: '请选择省/市' }]}>
              <Form.Item noStyle shouldUpdate={(prev, curr) => prev.city !== curr.city}>
                {({ getFieldValue, setFieldValue }) => (
                  <Cascader
                    options={chinaRegions}
                    placeholder="请选择省 / 市"
                    size="large"
                    className="rounded-lg w-full"
                    value={getCascadeValueFromCity(getFieldValue('city'))}
                    onChange={(v) => setFieldValue('city', Array.isArray(v) && v.length ? v[v.length - 1] : undefined)}
                    displayRender={(labels) => labels.join(' / ')}
                  />
                )}
              </Form.Item>
            </Form.Item>
            <Form.Item name="address" label="具体地址" rules={[{ required: true, message: '请输入地址' }]}>
              <Input placeholder="请输入详细地址" size="large" className="rounded-lg" />
            </Form.Item>
            <Form.Item label="联系电话">
              <Space.Compact className="w-full flex" size="middle">
                <div className="w-1/3 shrink-0">
                  <Form.Item name="phoneCode" noStyle > {/*noStyle initialValue="+86" 为重复设置*/}
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
                  <Form.Item name="phoneNumber" noStyle>
                    <Input placeholder="选填，输入号码" size="large" className="rounded-lg w-full" />
                  </Form.Item>
                </div>
              </Space.Compact>
            </Form.Item>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Form.Item name="price" label="起步价（元）" className="mb-0">
                <InputNumber placeholder="选填" min={0} precision={2} size="large" className="rounded-lg w-full" />
              </Form.Item>
              <Form.Item name="star_level" label="星级（1-5）" className="mb-0">
                <InputNumber placeholder="选填" min={1} max={5} precision={0} size="large" className="rounded-lg w-full" />
              </Form.Item>
            </div>
            <Form.Item label="标签（可多选）" className="mb-8">
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                <Form.Item name="tagList" noStyle>
                  <Checkbox.Group
                    options={TAG_OPTIONS}
                    className="flex w-full flex-wrap gap-x-6 gap-y-3 [&_.ant-checkbox-wrapper]:m-0"
                  />
                </Form.Item>
              </div>
            </Form.Item>
            <Form.Item name="image_url" label="封面图">
              <Form.Item noStyle shouldUpdate={(prev, curr) => prev.image_url !== curr.image_url}>
                {({ getFieldValue, setFieldValue }) => {
                  const existingUrl = getFieldValue('image_url')
                  const displayUrl = coverPreviewUrl || existingUrl
                  const clearCover = () => {
                    if (coverPreviewUrl) {
                      setPendingCoverFile(null)
                      setCoverPreview(null)
                    } else {
                      setFieldValue('image_url', undefined)
                    }
                  }
                  return (
                    <div className="flex flex-wrap items-center gap-3">
                      {displayUrl && (
                        <div className="relative inline-block">
                          <img src={displayUrl} alt="封面" className="h-40 w-40 object-cover rounded-lg border border-gray-200" />
                          <Button
                            type="text"
                            danger
                            size="small"
                            className="absolute -top-1 -right-1 h-6 w-6 min-w-0 p-0 rounded-full bg-white shadow"
                            icon={<DeleteOutlined />}
                            onClick={clearCover}
                          />
                        </div>
                      )}
                      {!displayUrl && (
                        <Upload
                          accept={COVER_ACCEPT}
                          showUploadList={false}
                          beforeUpload={(file) => {
                            setPendingCoverFile(file)
                            setCoverPreview(file)
                            return false
                          }}
                        >
                          <Button type="dashed" icon={<PictureOutlined />} className="rounded-lg">
                            选择封面图
                          </Button>
                        </Upload>
                      )}
                    </div>
                  )
                }}
              </Form.Item>
            </Form.Item>
            <Form.Item name="description" label="酒店介绍">
              <Input.TextArea placeholder="选填" rows={3} className="rounded-lg" />
            </Form.Item>
          </Card>

          <Card
            title="房型信息（至少一个）"
            className="mb-6 rounded-xl shadow-sm"
            extra={
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => form.setFieldValue('roomTypes', [...(form.getFieldValue('roomTypes') || []), { ...defaultRoomType }])}
              >
                添加房型
              </Button>
            }
          >
            <Form.List name="roomTypes">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...rest }) => (
                    <div key={key} className="flex items-start gap-2 mb-4 p-4 rounded-lg bg-gray-50/80">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Form.Item {...rest} name={[name, 'name']} label="房型名称" rules={[{ required: true }]}>
                          <Input placeholder="如：豪华大床房" size="large" className="rounded-lg" />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'price']} label="价格（元）" rules={[{ required: true }]}>
                          <InputNumber min={0} precision={2} size="large" className="rounded-lg w-full" />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'description']} label="描述" className="md:col-span-2">
                          <Input placeholder="如：30平米/有窗/含早" size="large" className="rounded-lg" />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'image_url']} label="房型图（可多张）" className="md:col-span-2">
                          <Form.Item noStyle shouldUpdate>
                            {({ getFieldValue, setFieldValue }) => {
                              const value = getFieldValue(['roomTypes', name, 'image_url']) as string | undefined
                              const urls = (value || '').split(',').filter(Boolean)
                              const pending = pendingRoomFiles[name] || []
                              const removeUrl = (idx: number) => {
                                const next = urls.filter((_, i) => i !== idx)
                                setFieldValue(['roomTypes', name, 'image_url'], next.join(','))
                              }
                              const removePending = (idx: number) => {
                                const list = [...(pendingRoomFiles[name] || [])]
                                URL.revokeObjectURL(list[idx].objectUrl)
                                list.splice(idx, 1)
                                setPendingRoomFiles((prev) => ({ ...prev, [name]: list }))
                              }
                              const addFile = (file: File) => {
                                const objectUrl = URL.createObjectURL(file)
                                setPendingRoomFiles((prev) => ({
                                  ...prev,
                                  [name]: [...(prev[name] || []), { file, objectUrl }],
                                }))
                              }
                              return (
                                <div className="flex flex-wrap items-center gap-3">
                                  {urls.map((u, i) => (
                                    <div key={u} className="relative inline-block">
                                      <img src={u} alt="" className="h-32 w-32 object-cover rounded-lg border border-gray-200" />
                                      <Button
                                        type="text"
                                        danger
                                        size="small"
                                        className="absolute -top-1 -right-1 h-5 w-5 min-w-0 p-0 rounded-full bg-white shadow text-xs"
                                        icon={<DeleteOutlined />}
                                        onClick={() => removeUrl(i)}
                                      />
                                    </div>
                                  ))}
                                  {pending.map((p, i) => (
                                    <div key={p.objectUrl} className="relative inline-block">
                                      <img src={p.objectUrl} alt="" className="h-32 w-32 object-cover rounded-lg border border-gray-200" />
                                      <Button
                                        type="text"
                                        danger
                                        size="small"
                                        className="absolute -top-1 -right-1 h-5 w-5 min-w-0 p-0 rounded-full bg-white shadow text-xs"
                                        icon={<DeleteOutlined />}
                                        onClick={() => removePending(i)}
                                      />
                                    </div>
                                  ))}
                                  <Upload accept={ROOM_ACCEPT} showUploadList={false} beforeUpload={(file) => { addFile(file); return false }}>
                                    <Button type="dashed" size="small" icon={<PlusOutlined />} className="rounded-lg">
                                      添加房型图
                                    </Button>
                                  </Upload>
                                </div>
                              )
                            }}
                          </Form.Item>
                        </Form.Item>
                      </div>
                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} className="mt-8" />
                    </div>
                  ))}
                  <Button type="dashed" icon={<PlusOutlined />} onClick={() => add()} block size="large" className="rounded-lg">
                    添加房型
                  </Button>
                </>
              )}
            </Form.List>
          </Card>

          {!readOnly && (
            <Form.Item className="mb-0">
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                loading={submitting || loadingDetail}
                className="h-12 px-8 rounded-xl font-medium shadow-md hover:shadow-lg transition-shadow border-0"
                style={{ background: 'linear-gradient(135deg, #32bcef 0%, #2c4fa3 100%)' }}
              >
                {editId ? '提交更新' : '提交发布'}
              </Button>
            </Form.Item>
          )}
          {readOnly && (detailStatus === 2 || detailStatus === 3) && (
            <div className="mt-6 pt-4 border-t border-gray-200">
              <p className="text-red-600 font-medium m-0">
                {detailStatus === 3 ? '下线原因：' : '拒绝原因：'}
                <span className="font-normal">{detailCancellation || '无'}</span>
              </p>
            </div>
          )}
        </Form>
      </div>
    </PageLayout>
  )
}
