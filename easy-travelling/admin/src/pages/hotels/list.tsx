import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Collapse, Input, Modal, Rate, Space, Tag, Upload } from 'antd'
import type { CollapseProps } from 'antd'
import {
  CameraOutlined,
  CopyOutlined,
  DeleteOutlined,
  DollarOutlined,
  EditOutlined,
  EnvironmentOutlined,
  EyeOutlined,
  HomeOutlined,
  PlusOutlined,
  RollbackOutlined,
  StarFilled,
  StopOutlined,
} from '@ant-design/icons'
import { getMyHotels, withdrawHotel, deleteHotel, getHotelDetail, type HotelItem } from '../../api/hotels'
import { getMe, updateMe } from '../../api/auth'
import { uploadFile } from '../../api/request'
import { getUser, setUser } from '../../utils/auth'
import { toast } from '../../utils/toast'
import defaultHotelImg from '../../img/hotel-defalt.jpg'
import pageBg from '../../img/bg-1.png'
import sidebarBg from '../../img/bg-3.jpg'
import defaultAvatar from '../../img/defaultAvatar.jpg'

interface StatusConfig {
  text: string
  color: 'success' | 'processing' | 'error' | 'default' | 'warning'
}

interface MerchantProfile {
  id: number
  username: string
  role: string
  avatar: string | null
  phone: string | null
  created_at: string
  role_code: string | null
}

const STATUS_CONFIG: Record<number, StatusConfig> = {
  0: { text: '待审核', color: 'processing' },
  1: { text: '已发布', color: 'success' },
  2: { text: '已拒绝', color: 'error' },
  3: { text: '已下线', color: 'default' },
}

const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

function formatDate(dateLike?: string | null): string {
  if (!dateLike) return '-'
  const d = new Date(dateLike)
  if (Number.isNaN(d.getTime())) return String(dateLike).slice(0, 10)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

export default function HotelListPage() {
  const navigate = useNavigate()
  const user = getUser()
  const [list, setList] = useState<HotelItem[]>([])
  const [activeKeys, setActiveKeys] = useState<string[]>([])
  const [profile, setProfile] = useState<MerchantProfile | null>(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [editingPassword, setEditingPassword] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [editUsername, setEditUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)
  const avatarPreviewRef = useRef<string | null>(null)

  const clearAvatarPreview = () => {
    if (avatarPreviewRef.current) {
      URL.revokeObjectURL(avatarPreviewRef.current)
      avatarPreviewRef.current = null
    }
    setAvatarPreviewUrl(null)
  }

  const setAvatarPreview = (file: File | null) => {
    clearAvatarPreview()
    if (!file) {
      setPendingAvatarFile(null)
      return
    }
    const url = URL.createObjectURL(file)
    avatarPreviewRef.current = url
    setPendingAvatarFile(file)
    setAvatarPreviewUrl(url)
  }

  useEffect(() => {
    return () => clearAvatarPreview()
  }, [])

  const loadList = async () => {
    if (!user || user.role !== 'merchant') return
    try {
      const data = await getMyHotels()
      const hotelList = Array.isArray(data) ? data : []
      const detailPromises = hotelList.map(async (hotel) => {
        try {
          const detail = await getHotelDetail(hotel.id)
          return { ...hotel, roomTypes: detail.roomTypes }
        } catch {
          return hotel
        }
      })
      const withRooms = await Promise.all(detailPromises)
      setList(withRooms)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败')
      setList([])
    }
  }

  const loadProfile = async () => {
    if (!user || user.role !== 'merchant') return
    try {
      const res = await getMe()
      if (res?.user) {
        const next = res.user as MerchantProfile
        setProfile(next)
        setEditUsername(next.username || '')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载用户信息失败')
    }
  }

  useEffect(() => {
    if (!user || user.role !== 'merchant') {
      navigate('/login', { replace: true })
      return
    }
    loadList()
    loadProfile()
  }, [navigate, user?.id, user?.role])

  const getStatusTag = (status: number) => {
    const config = STATUS_CONFIG[status]
    return <Tag color={config?.color ?? 'default'}>{config?.text ?? '未知'}</Tag>
  }

  const getPriceText = (record: HotelItem) => {
    if (record.price != null) return `¥${record.price}/晚起`
    return '价格待定'
  }

  const getHotelImage = (record: HotelItem) => {
    if (record.image_url) return record.image_url
    return defaultHotelImg
  }

  const handleExpand = (keys: string | string[]) => {
    const nextKeys = Array.isArray(keys) ? keys : [keys]
    setActiveKeys(nextKeys)
    if (nextKeys.length === 0) return

    const hotelId = parseInt(nextKeys[0], 10)
    const hotel = list.find((h) => h.id === hotelId)
    if (!hotel || hotel.roomTypes) return

    getHotelDetail(hotelId)
      .then((detail) => {
        setList((prev) => prev.map((h) => (h.id === hotelId ? { ...h, roomTypes: detail.roomTypes } : h)))
      })
      .catch(() => {})
  }

  const handleWithdraw = (record: HotelItem) => {
    Modal.confirm({
      title: '确认退回申请？',
      content: `确认退回“${record.name}”吗？`,
      okText: '确定',
      cancelText: '取消',
      onOk: () =>
        withdrawHotel(record.id)
          .then(() => {
            toast.success('已退回申请')
            loadList()
          })
          .catch((e) => toast.error(e instanceof Error ? e.message : '操作失败')),
    })
  }

  const handleDelete = (record: HotelItem, actionName: string) => {
    Modal.confirm({
      title: `确认${actionName}？`,
      content: `“${record.name}”将被删除且不可恢复。`,
      okText: '确定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () =>
        deleteHotel(record.id)
          .then(() => {
            toast.success('已删除')
            loadList()
          })
          .catch((e) => toast.error(e instanceof Error ? e.message : '操作失败')),
    })
  }

  const copyInviteCode = async () => {
    const code = profile?.role_code?.trim()
    if (!code) {
      toast.error('暂无邀请码')
      return
    }
    try {
      await navigator.clipboard.writeText(code)
      toast.success('邀请码已复制')
    } catch {
      const input = document.createElement('input')
      input.value = code
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      toast.success('邀请码已复制')
    }
  }

  const startEditProfile = () => {
    setEditingProfile(true)
    setEditingPassword(false)
    setEditUsername(profile?.username || user?.username || '')
    setAvatarPreview(null)
  }

  const submitProfile = async () => {
    if (!profile) return
    const username = editUsername.trim()
    if (username.length < 2) {
      toast.error('商户名称至少 2 个字符')
      return
    }

    setSavingProfile(true)
    try {
      let avatar = profile.avatar
      if (pendingAvatarFile) {
        const uploaded = await uploadFile(pendingAvatarFile)
        if (!uploaded.url) throw new Error(uploaded.message || '头像上传失败')
        avatar = uploaded.url
      }

      const res = await updateMe({ username, avatar })
      const nextUser = res?.user
      const finalUsername = nextUser?.username || username
      const finalAvatar = nextUser?.avatar ?? avatar ?? null

      setProfile((prev) => (prev ? { ...prev, username: finalUsername, avatar: finalAvatar } : prev))

      const latest = getUser()
      if (latest) {
        setUser({
          ...latest,
          username: finalUsername,
          avatar: finalAvatar,
        })
      }

      setEditingProfile(false)
      setEditingPassword(false)
      setAvatarPreview(null)
      toast.success('个人资料已更新')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新失败')
    } finally {
      setSavingProfile(false)
    }
  }

  const startEditPassword = () => {
    setEditingPassword(true)
    setEditingProfile(false)
    setNewPassword('')
    setConfirmPassword('')
    setAvatarPreview(null)
  }

  const submitPassword = async () => {
    const pwd = newPassword
    const confirm = confirmPassword
    if (pwd.length < 6) {
      toast.error('新密码至少 6 位')
      return
    }
    if (pwd !== confirm) {
      toast.error('两次输入的新密码不一致')
      return
    }

    setSavingProfile(true)
    try {
      await updateMe({ password: pwd })
      setEditingPassword(false)
      setEditingProfile(false)
      setNewPassword('')
      setConfirmPassword('')
      toast.success('密码修改成功')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '密码修改失败')
    } finally {
      setSavingProfile(false)
    }
  }

  const renderActionButtons = (record: HotelItem) => {
    const viewBtn = (
      <Button
        type="link"
        size="small"
        icon={<EyeOutlined />}
        onClick={(e) => {
          e.stopPropagation()
          navigate(`/hotels/publish?id=${record.id}&view=1`)
        }}
        className="text-gray-600 hover:text-[#2c4fa3]"
      >
        查看信息
      </Button>
    )

    if (record.status === 0) {
      return (
        <>
          <Button
            type="link"
            size="small"
            icon={<RollbackOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              handleWithdraw(record)
            }}
            className="text-orange-600 hover:text-orange-700"
          >
            退回申请
          </Button>
          {viewBtn}
        </>
      )
    }

    if (record.status === 1) {
      return (
        <>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/hotels/publish?id=${record.id}`)
            }}
            className="text-[#2c4fa3] hover:text-[#32bcef]"
          >
            编辑并重新发布
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<StopOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              handleDelete(record, '下架')
            }}
          >
            下架
          </Button>
          {viewBtn}
        </>
      )
    }

    return (
      <>
        <Button
          type="link"
          size="small"
          icon={<EditOutlined />}
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/hotels/publish?id=${record.id}`)
          }}
          className="text-[#2c4fa3] hover:text-[#32bcef]"
        >
          重新发布
        </Button>
        <Button
          type="link"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={(e) => {
            e.stopPropagation()
            handleDelete(record, '删除')
          }}
        >
          删除
        </Button>
        {viewBtn}
      </>
    )
  }

  const collapseItems: CollapseProps['items'] = useMemo(
    () =>
      list.map((hotel) => ({
        key: String(hotel.id),
        label: (
          <div className="flex items-center py-2">
            <div className="mr-4 shrink-0">
              <img
                src={getHotelImage(hotel)}
                alt={hotel.name}
                className="h-14 w-20 rounded-lg border border-gray-100 object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-3">
                <h3 className="m-0 max-w-[220px] truncate text-lg font-semibold text-[#2C4398]">{hotel.name}</h3>
                {hotel.star_level ? (
                  <Rate disabled value={hotel.star_level} character={<StarFilled />} className="text-sm text-blue-400" />
                ) : null}
                {getStatusTag(hotel.status)}
              </div>
              <div className="flex items-center text-sm text-gray-500">
                <EnvironmentOutlined className="mr-1 text-gray-400" />
                <span className="max-w-md truncate">{hotel.city || '未设置城市'}</span>
              </div>
            </div>
            <div className="ml-4 shrink-0 text-right">
              <div className="mb-0.5 text-xs text-gray-400">起步价</div>
              <div className="text-lg font-semibold text-[#2c4fa3]">{getPriceText(hotel)}</div>
            </div>
          </div>
        ),
        children: (
          <div className="space-y-4 px-2 pb-4">
            {hotel.address ? (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-gray-50 p-3 text-gray-600">
                <HomeOutlined className="mt-0.5 text-gray-400" />
                <span className="flex-1 text-sm">{hotel.address}</span>
              </div>
            ) : null}

            {hotel.phone ? (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>联系电话</span>
                <span>{hotel.phone}</span>
              </div>
            ) : null}

            {hotel.roomTypes && hotel.roomTypes.length > 0 ? (
              <div className="flex flex-wrap items-center gap-4">
                {hotel.roomTypes.map((room, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <span className="rounded-full bg-[#33C7F7] px-4 py-1.5 text-sm font-medium text-white">{room.name}</span>
                    <span className="rounded-full bg-[#33C7F7] px-4 py-1.5 text-sm font-medium text-white">¥{room.price}/晚</span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex items-center justify-between border-t border-gray-100 pt-2">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">
                  <DollarOutlined className="mr-1" />
                  起步价 {getPriceText(hotel)}
                </span>
              </div>
              <Space size="middle">{renderActionButtons(hotel)}</Space>
            </div>
          </div>
        ),
        className: `mb-6 overflow-hidden rounded-2xl border-0 bg-white shadow-sm transition-all duration-200 hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[0_10px_24px_rgba(44,67,155,0.26)] ${
          hotel.status === 2 || hotel.status === 3 ? 'opacity-75' : ''
        }`,
      })),
    [list],
  )

  const avatarDisplay = avatarPreviewUrl || profile?.avatar || defaultAvatar

  return (
    <div className="relative min-h-full flex-1 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${pageBg})`, backgroundSize: '100% 100%' }}
        aria-hidden
      />

      {/* ✅【修改位置1】调整左右区域比例：左侧从 1/4 改为 1/5，右侧从 3/4 改为 4/5 */}
      <div className="flex min-h-[calc(100vh-56px)] flex-col lg:flex-row">
        {/* ✅【修改】左侧宽度从 w-1/4 改为 w-1/5，最小宽度从 320px 减到 280px */}
        <aside className="w-full lg:w-1/5 lg:min-w-[280px]">
          <div
            className="relative min-h-[420px] overflow-hidden bg-cover bg-center shadow-[0_18px_45px_rgba(20,36,90,0.28)] lg:min-h-[calc(100vh-56px)]"
            // ✅【修改位置6】可以在这里更换背景图片或使用渐变色
            // ✅【修改】添加 backgroundPosition 参数，方便调整图片显示位置
            style={{ 
              background: `url(${sidebarBg}) no-repeat -160px -200px / 250% 120%`,
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-[#1e4fba]/70 to-[#9d5ed8]/55" />
            {/* ✅【修改位置2】内边距从 p-6 减小到 p-4 */}
            <div className="relative z-10 flex min-h-[420px] flex-col p-4 text-white lg:min-h-[calc(100vh-56px)]">
              {editingPassword ? (
                <div className="mx-auto mt-12 w-full max-w-[260px]">
                  <div className="mb-2 text-sm font-medium text-white/90">新密码</div>
                  <Input.Password
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="请输入新密码"
                    className="h-11 rounded-lg border-white/60 bg-white/90 text-base text-[#1f3f95]"
                  />
                  <div className="mb-2 mt-4 text-sm font-medium text-white/90">确认新密码</div>
                  <Input.Password
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="请再次输入新密码"
                    className="h-11 rounded-lg border-white/60 bg-white/90 text-base text-[#1f3f95]"
                  />
                </div>
              ) : editingProfile ? (
                <div className="mx-auto mt-10 w-full max-w-[240px] text-center">
                  <Upload
                    accept={AVATAR_ACCEPT}
                    showUploadList={false}
                    beforeUpload={(file) => {
                      setAvatarPreview(file)
                      return false
                    }}
                  >
                    <button type="button" className="group relative mx-auto block rounded-full">
                      <img
                        src={avatarDisplay}
                        alt="avatar"
                        className="h-28 w-28 rounded-full border-4 border-white/30 object-cover shadow-lg"
                      />
                      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
                        <CameraOutlined className="text-xl text-white" />
                      </span>
                    </button>
                  </Upload>

                  <div className="mt-6 text-left text-sm font-medium text-white/90">商户名称</div>
                  <Input
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    maxLength={30}
                    placeholder="请输入商户名称"
                    className="mt-2 h-11 rounded-lg border-white/60 bg-white/90 text-center text-lg font-semibold text-[#1f3f95]"
                  />
                </div>
              ) : (
                <>
                  {/* ✅【修改位置3】非编辑模式下的用户信息展示区域 - 减小间距和尺寸 */}
                  <div className="mb-4 flex flex-col items-center text-center">
                    <img
                      src={avatarDisplay}
                      alt="avatar"
                      className="h-24 w-24 rounded-full border-4 border-white/30 object-cover shadow-lg"
                    />
                    <h3 className="mb-0 mt-2 text-2xl font-bold">{profile?.username || user?.username || '商户'}</h3>
                    <p className="m-0 text-xs text-white/80">资深酒店管理专家</p>
                  </div>

                  {/* ✅【修改位置4】信息卡片区域 - 减小间距、内边距和文字大小 */}
                  <div className="space-y-3">
                    <div className="rounded-xl bg-white/22 p-3 backdrop-blur-sm">
                      <div className="text-xs text-white/80">商户ID</div>
                      <div className="mt-1 text-lg font-semibold">HS{String(profile?.id || user?.id || '').padStart(8, '0')}</div>
                    </div>
                    <div className="rounded-xl bg-white/22 p-3 backdrop-blur-sm">
                      <div className="text-xs text-white/80">注册时间</div>
                      <div className="mt-1 text-lg font-semibold">{formatDate(profile?.created_at)}</div>
                    </div>
                    <div className="rounded-xl bg-white/22 p-3 backdrop-blur-sm">
                      <div className="text-xs text-white/80">商户电话</div>
                      <div className="mt-1 text-lg font-semibold">{profile?.phone || '-'}</div>
                    </div>
                    <div className="rounded-xl bg-white/22 p-3 backdrop-blur-sm">
                      <div className="text-xs text-white/80">邀请码</div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="truncate text-lg font-semibold text-[#7CFFBE]">{profile?.role_code || '暂无'}</span>
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={copyInviteCode}
                          className="text-white hover:!text-white"
                          disabled={!profile?.role_code}
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ✅【修改位置5】底部按钮区域 - 上边距从 pt-8 减小到 pt-4 */}
              <div className="mt-auto pt-4">
                {editingProfile ? (
                  // ✅【修改】编辑资料模式 - 返回按钮在提交按钮上方
                  <div className="space-y-3">
                  {/* 返回按钮 - 与提交按钮相同样式但不同颜色 */}
                    <Button
                      block
                      loading={savingProfile}
                      className="h-11 rounded-lg border-0 bg-[#4f86df] text-white hover:!bg-[#5a90e8] hover:!text-white"
                      onClick={submitProfile}
                    >
                      提交修改
                    </Button>

                    <Button
                      block
                      size="large"
                      icon={<RollbackOutlined />}
                      onClick={() => {
                        setEditingProfile(false);
                        setEditingPassword(false);
                      }}
                      className="h-11 rounded-lg border border-white/30 bg-white/20 text-white hover:bg-white/30 hover:border-white/40 flex items-center justify-center"
                    >
                      返回
                    </Button>
                  </div>
                  
                ) : editingPassword ? (
                  // ✅【修改】编辑资料模式 - 返回按钮在提交按钮上方
                  <div className="space-y-3">
                  {/* 返回按钮 - 与提交按钮相同样式但不同颜色 */}
                    <Button
                      block
                      loading={savingProfile}
                      className="h-11 rounded-lg border-0 bg-[#4f86df] text-white hover:!bg-[#5a90e8] hover:!text-white"
                      onClick={submitPassword}
                    >
                      提交修改
                    </Button>

                    <Button
                      block
                      size="large"
                      icon={<RollbackOutlined />}
                      onClick={() => {
                        setEditingProfile(false);
                        setEditingPassword(false);
                      }}
                      className="h-11 rounded-lg border border-white/30 bg-white/20 text-white hover:bg-white/30 hover:border-white/40 flex items-center justify-center"
                    >
                      返回
                    </Button>
                  </div>

                ) : (
                  <div className="space-y-3">
                    <Button
                      block
                      className="h-11 rounded-lg border-0 bg-[#4f86df] text-white hover:!bg-[#5a90e8] hover:!text-white"
                      onClick={startEditProfile}
                    >
                      修改个人资料
                    </Button>
                    <Button
                      block
                      className="h-11 rounded-lg border-0 bg-[#3f74c9] text-white hover:!bg-[#4d83d8] hover:!text-white"
                      onClick={startEditPassword}
                    >
                      修改密码
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* ✅【修改】右侧宽度从 w-3/4 改为 w-4/5 */}
        <main className="w-full lg:w-4/5 p-6 md:p-8">
          <div className="relative z-20 mb-6 flex items-center justify-between">
            <div>
              <h1 className="m-0 text-2xl font-bold tracking-tight text-gray-800 md:text-3xl">我的酒店</h1>
              <p className="mb-0 mt-1 text-sm text-gray-500">共 {list.length} 家酒店，点击卡片可展开操作</p>
            </div>
            <Link to="/hotels/publish">
              <Button
                type="primary"
                icon={<PlusOutlined />}
                size="large"
                className="flex h-11 items-center rounded-xl border-0 px-6 font-medium shadow-md transition-shadow hover:shadow-lg"
                style={{ background: 'linear-gradient(135deg, #32bcef 0%, #2c4fa3 100%)' }}
              >
                发布酒店
              </Button>
            </Link>
          </div>

          {list.length === 0 ? (
            <div className="rounded-2xl bg-white/95 p-16 text-center shadow-sm">
              <div className="mb-4 text-7xl text-gray-300">🏣</div>
              <h3 className="mb-2 text-xl font-medium text-gray-600">暂无酒店</h3>
              <p className="mb-6 text-gray-400">点击“发布酒店”按钮，开始添加您的第一家酒店</p>
              <Link to="/hotels/publish">
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  className="h-10 rounded-lg px-5"
                  style={{ background: 'linear-gradient(135deg, #32bcef 0%, #2c4fa3 100%)' }}
                >
                  立即发布
                </Button>
              </Link>
            </div>
          ) : (
            <Collapse
              items={collapseItems}
              activeKey={activeKeys}
              onChange={handleExpand}
              expandIcon={({ isActive }) => (
                <span
                  className={`mr-3 inline-block h-2 w-2 rounded-full transition-colors duration-200 ${
                    isActive ? 'bg-[#2c4fa3]' : 'bg-[#33C7F7]'
                  }`}
                />
              )}
              expandIconPlacement="start"
              className="border-0 bg-transparent [&_.ant-collapse-item]:!border-0 [&_.ant-collapse-item]:!bg-white [&_.ant-collapse-item]:!overflow-hidden [&_.ant-collapse-item]:!rounded-2xl [&_.ant-collapse-header]:!bg-white [&_.ant-collapse-content]:!bg-white [&_.ant-collapse-content-box]:!bg-white"
            />
          )}
        </main>
      </div>
    </div>
  )
}
