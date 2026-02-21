import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Button, Space, Tabs, Modal, Input, Upload } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { getMe, updateMe } from '../../api/auth'
import { getUser, setUser } from '../../utils/auth'
import { uploadFile } from '../../api/request'
//import { EyeOutlined, StopOutlined, DeleteOutlined, CheckOutlined, CloseOutlined, SyncOutlined } from '@ant-design/icons'
import { 
  EyeOutlined, 
  StopOutlined, 
  DeleteOutlined, 
  CheckOutlined, 
  CloseOutlined, 
  SyncOutlined,
  CameraOutlined,
  CopyOutlined,
  RollbackOutlined,
} from '@ant-design/icons'
// ✅【新增】添加左侧栏需要的图标

import PageLayout from '../../components/PageLayout'
import {
  getPublishedHotels,
  getPendingHotels,
  approveHotel,
  rejectHotel,
  offlineHotel,
  deleteHotelAdmin,
  type AdminHotelItem,
  type AdminPendingHotelItem,
} from '../../api/admin'

import { toast } from '../../utils/toast'
import type { TableProps } from 'antd' // ✅【修改】导入 TableProps

// ✅【新增】添加图片导入
import defaultHotelImg from '../../img/hotel-defalt.jpg'
import pageBg from '../../img/bg-1.png'
import sidebarBg from '../../img/bg-3.jpg'
import defaultAvatar from '../../img/defaultAvatar.jpg'

const STATUS_PUBLISHED = 1
const STATUS_OFFLINE = 3

// ✅【新增】商户资料类型定义
interface MerchantProfile {
  id: number
  username: string
  role: string
  avatar: string | null
  phone: string | null
  created_at: string
  role_code: string | null
}

// ✅【新增】头像上传接受的文件类型
const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

// ✅【新增】日期格式化函数
function formatDate(dateLike?: string | null): string {
  if (!dateLike) return '-'
  const d = new Date(dateLike)
  if (Number.isNaN(d.getTime())) return String(dateLike).slice(0, 10)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

// ✅【修改】添加表格参数接口定义
interface TableParams {
  pagination?: {
    current?: number;
    pageSize?: number;
    total?: number;
  };
  filters?: Record<string, any>;
  sorter?: Record<string, any>;
}

export default function AdminManageHotelsPage() {
  const navigate = useNavigate()
  const user = getUser()
  const [activeTab, setActiveTab] = useState<string>('published')
  const [publishedList, setPublishedList] = useState<AdminHotelItem[]>([])
  const [pendingList, setPendingList] = useState<AdminPendingHotelItem[]>([])
  const [loadingPublished, setLoadingPublished] = useState(false)
  const [loadingPending, setLoadingPending] = useState(false)

  // 下线弹窗
  const [offlineModalOpen, setOfflineModalOpen] = useState(false)
  const [offlineReason, setOfflineReason] = useState('')
  const [offlineTargetId, setOfflineTargetId] = useState<number | null>(null)
  const [offlineSubmitting, setOfflineSubmitting] = useState(false)

  // 拒绝弹窗
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectTargetId, setRejectTargetId] = useState<number | null>(null)
  const [rejectSubmitting, setRejectSubmitting] = useState(false)

  // ✅【新增】左侧栏需要的状态
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

  // ✅【修改】添加表格筛选相关状态
  const [publishedTableParams, setPublishedTableParams] = useState<TableParams>({
    pagination: {
      current: 1,
      pageSize: 10,
    },
  });

  const [pendingTableParams, setPendingTableParams] = useState<TableParams>({
    pagination: {
      current: 1,
      pageSize: 10,
    },
  });

  const [filteredPublishedList, setFilteredPublishedList] = useState<AdminHotelItem[]>([]);
  const [filteredPendingList, setFilteredPendingList] = useState<AdminPendingHotelItem[]>([]);

  // ✅【修改】当原始数据变化时，更新筛选后的数据
  useEffect(() => {
    setFilteredPublishedList(publishedList);
  }, [publishedList]);
  
  useEffect(() => {
    setFilteredPendingList(pendingList);
  }, [pendingList]);

  const loadPublished = () => {
    setLoadingPublished(true)
    getPublishedHotels()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setPublishedList(list);
        setFilteredPublishedList(list); // ✅【修改】添加这一行
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : '加载失败')
        setPublishedList([])
        setFilteredPublishedList([]); // ✅【修改】添加这一行
      })
      .finally(() => setLoadingPublished(false))
  }

  const loadPending = () => {
    setLoadingPending(true)
    getPendingHotels()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setPendingList(list);
        setFilteredPendingList(list); // ✅【修改】添加这一行
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : '加载失败')
        setPendingList([])
        setFilteredPendingList([]); // ✅【修改】添加这一行
      })
      .finally(() => setLoadingPending(false))
  }

  useEffect(() => {
    if (!user || user.role !== 'admin') return
    loadPublished()
    loadPending()
    loadProfile() // ✅【新增】加载管理员资料
  }, [user?.id])

  const openOfflineModal = (record: AdminHotelItem) => {
    setOfflineTargetId(record.id)
    setOfflineReason('')
    setOfflineModalOpen(true)
  }

  const closeOfflineModal = () => {
    setOfflineModalOpen(false)
    setOfflineTargetId(null)
    setOfflineReason('')
  }

  const submitOffline = () => {
    if (offlineTargetId == null) return
    setOfflineSubmitting(true)
    offlineHotel(offlineTargetId, offlineReason.trim() || '')
      .then(() => {
        toast.success('已下线')
        closeOfflineModal()
        // 重新拉取已发布列表，确保表格中该行的 update_time 显示为最新
        loadPublished()
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : '操作失败'))
      .finally(() => setOfflineSubmitting(false))
  }

  const openRejectModal = (record: AdminPendingHotelItem) => {
    setRejectTargetId(record.id)
    setRejectReason('')
    setRejectModalOpen(true)
  }

  const closeRejectModal = () => {
    setRejectModalOpen(false)
    setRejectTargetId(null)
    setRejectReason('')
  }

  const submitReject = () => {
    if (rejectTargetId == null) return
    setRejectSubmitting(true)
    rejectHotel(rejectTargetId, rejectReason.trim() || '')
      .then(() => {
        toast.success('已拒绝')
        closeRejectModal()
        loadPending()
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : '操作失败'))
      .finally(() => setRejectSubmitting(false))
  }

  const handleApprove = (record: AdminPendingHotelItem) => {
    approveHotel(record.id)
      .then(() => {
        toast.success('已通过')
        loadPending()
        loadPublished()
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : '操作失败'))
  }

  const handleDeletePublished = (record: AdminHotelItem) => {
    Modal.confirm({
      title: '确认删除？',
      content: `「${record.name}」将被永久删除，且无法恢复。`,
      okText: '确定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        deleteHotelAdmin(record.id)
          .then(() => {
            toast.success('已删除')
            loadPublished()
          })
          .catch((e) => toast.error(e instanceof Error ? e.message : '操作失败'))
      },
    })
  }

  const viewDetail = (id: number) => {
    navigate(`/hotels/publish?id=${id}&view=1&from=admin`)
  }

  // ✅【新增】左侧栏头像预览相关函数
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

  // ✅【新增】加载管理员资料
  const loadProfile = async () => {
    if (!user || user.role !== 'admin') return
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

  // ✅【新增】复制邀请码
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

  // ✅【新增】开始编辑资料
  const startEditProfile = () => {
    setEditingProfile(true)
    setEditingPassword(false)
    setEditUsername(profile?.username || user?.username || '')
    setAvatarPreview(null)
  }

  // ✅【新增】提交资料修改
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

  // ✅【新增】开始修改密码
  const startEditPassword = () => {
    setEditingPassword(true)
    setEditingProfile(false)
    setNewPassword('')
    setConfirmPassword('')
    setAvatarPreview(null)
  }

  // ✅【新增】提交密码修改
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

  const publishedColumns: ColumnsType<AdminHotelItem> = [
    // ✅【新增】第1列：酒店图片
    {
      title: '酒店图片',
      dataIndex: 'image_url',
      key: 'image_url',
      width: 100,
      render: (imageUrl: string | null) => (
        <div className="flex items-center justify-center">
          {imageUrl ? (
            <img 
              src={imageUrl} 
              alt="酒店"
              className="w-16 h-16 rounded-lg object-cover border border-gray-200"
              onError={(e) => {
                (e.target as HTMLImageElement).src =  defaultHotelImg;
                (e.target as HTMLImageElement).className = 'w-16 h-16 rounded-lg object-cover border border-gray-200 opacity-70';
              }}
            />
          ) : (
            // ✅【修改】没有图片时显示默认图片
            <img 
              src={defaultHotelImg} 
              alt="默认酒店"
              className="w-16 h-16 rounded-lg object-cover border border-gray-200 opacity-70"
            />
          )}
        </div>
      ),
    },
  
    // ✅【新增】第2列：商户ID（来自sys_users表的id）
    {
      title: '商户ID',
      dataIndex: 'merchant_id',
      key: 'merchant_id',
      width: 100,
      render: (merchantId: number) => (
        <span className="font-mono text-[#2c4fa3] font-medium">
          HS{String(merchantId).padStart(8, '0')}
        </span>
      ),
      sorter: (a, b) => (a.merchant_id || 0) - (b.merchant_id || 0),
    },

    { 
      title: '商户名称', 
      dataIndex: 'merchant_name', 
      key: 'merchant_name', 
      width: 120, 
      ellipsis: true,
      // ✅【修改】添加筛选功能
      
      // ✅【修复】过滤掉null/undefined值，确保value为string类型
      filters: Array.from(new Set(publishedList.map(item => item.merchant_name).filter((name): name is string => name != null))).map(name => ({
        text: name,
        value: name,
      })),
      // ✅【修复】添加安全的条件判断
      onFilter: (value, record) => record.merchant_name ? record.merchant_name.indexOf(value as string) === 0 : false,
      filterSearch: true,
    },

    { 
      title: '酒店名称', 
      dataIndex: 'name', 
      key: 'name', 
      ellipsis: true, 
      width: 160,
      // ✅【修改】添加筛选功能
       // ✅【修复】过滤掉null/undefined值，确保value为string类型
      filters: Array.from(new Set(publishedList.map(item => item.name).filter((name): name is string => name != null))).map(name => ({
        text: name,
        value: name,
      })),
      // ✅【修复】添加安全的条件判断
      onFilter: (value, record) => record.name ? record.name.indexOf(value as string) === 0 : false,
      filterSearch: true,
    },

    { 
      title: '城市', 
      dataIndex: 'city', 
      key: 'city', 
      width: 100,
      // ✅【修改】添加筛选功能
       // ✅【修复】过滤掉null/undefined值，确保value为string类型
      filters: Array.from(new Set(publishedList.map(item => item.city).filter((city): city is string => city != null))).map(city => ({
        text: city,
        value: city,
      })),
      // ✅【修复】添加安全的条件判断
      onFilter: (value, record) => record.city ? record.city.indexOf(value as string) === 0 : false,
      filterSearch: true,
    },
    
    {
      title: '起步价',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (v: number | null) => (v != null ? `¥${v}` : '-'),
      // ✅【修改】添加排序功能
      sorter: (a, b) => (a.price || 0) - (b.price || 0),
      sortDirections: ['ascend', 'descend', 'ascend'],
    },

     {
      title: '星级',
      dataIndex: 'star_level',
      key: 'star_level',
      width: 100,
      //render: (v: number | null) => (v != null ? `${v}星` : '-'),
      
      // ✅【修改】render 函数：将数字星级改为星星图标显示
      render: (v: number | null) => {
        if (v == null) return '-';
        return (
          <div className="flex items-center">
            <span className="text-[#33C7F7] text-base">
              {'★'.repeat(v)}
            </span>
            {v < 5 && <span className="text-gray-300 text-base">
              {'★'.repeat(5 - v)}
            </span>}
          </div>
        );
      },

      // ✅【修改】添加筛选功能
      
      // ✅【修复】过滤掉null/undefined值，确保value为number类型
      filters: Array.from(new Set(publishedList.map(item => item.star_level).filter((star): star is number => star != null))).map(star => ({
        // ✅【修改】filters 中的 text 函数：将筛选菜单中的文字改为星星图标
        text: (
          <div className="flex items-center">
            <span className="text-[#33C7F7] text-base">{'★'.repeat(star)}</span>
            {star < 5 && <span className="text-gray-300">{'★'.repeat(5 - star)}</span>}
            <span className="ml-1">({star}星)</span>
          </div>
        ),
        value: star,
      })),
      onFilter: (value, record) => record.star_level === value,
    },

    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: number) => (s === STATUS_PUBLISHED ? '已发布' : '已下线'),
      // ✅【修改】添加筛选功能
      filters: [
        { text: '已发布', value: STATUS_PUBLISHED },
        { text: '已下线', value: STATUS_OFFLINE },
      ],
      onFilter: (value, record) => record.status === value,
    },

    {
      title: '更新时间',
      dataIndex: 'update_time',
      key: 'update_time',
      width: 160,
      render: (_: unknown, record: AdminHotelItem) => {
        const v = record.update_time ?? (record as { updateTime?: string | null }).updateTime ?? null;
        if (v == null || v === '') return '-';
        const s = typeof v === 'string' ? v : String(v);
        return s.replace('T', ' ').slice(0, 19);
      },
      // ✅【修改】添加排序功能
      sorter: (a, b) => {
        const timeA = a.update_time ? new Date(a.update_time).getTime() : 0;
        const timeB = b.update_time ? new Date(b.update_time).getTime() : 0;
        return timeA - timeB;
      },
    },

    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_, record) => {
        if (record.status === STATUS_OFFLINE) {
          return (
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDeletePublished(record)}
            >
              删除
            </Button>
          )
        }
        return (
          <Space size="small">
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => viewDetail(record.id)}>
              查看信息
            </Button>
            {/* ✅【修改】将下线的文字按钮改为标签样式（可选） */}
            <Button 
              type="primary" 
              size="small" 
              danger 
              icon={<StopOutlined />} 
              onClick={() => openOfflineModal(record)}
              // ✅【修改】在 className 中添加 active 状态的阴影样式
              className="rounded-full shadow-sm hover:shadow-md hover:shadow-red-200/50 active:shadow-lg active:shadow-red-300/70 transition-all duration-200"
            >
              下线
            </Button>
          </Space>
        )
      },
    },
  ]

  // ✅【修改】待审核表格列定义 - 添加筛选和排序功能
  const pendingColumns: ColumnsType<AdminPendingHotelItem> = [
    // ✅【新增】第1列：酒店图片
    {
      title: '酒店图片',
      dataIndex: 'image_url',
      key: 'image_url',
      width: 100,
      render: (imageUrl: string | null) => (
        <div className="flex items-center justify-center">
          {imageUrl ? (
            <img 
              src={imageUrl} 
              alt="酒店"
              className="w-16 h-16 rounded-lg object-cover border border-gray-200"
              onError={(e) => {
                (e.target as HTMLImageElement).src = defaultHotelImg;
                (e.target as HTMLImageElement).className = 'w-16 h-16 rounded-lg object-cover border border-gray-200 opacity-70';
              }}
            />
          ) : (
            <img 
              src={defaultHotelImg} 
              alt="默认酒店"
              className="w-16 h-16 rounded-lg object-cover border border-gray-200 opacity-70"
            />
          )}
        </div>
      ),
    },
  
    // ✅【新增】第2列：商户ID（来自sys_users表的id）
    {
      title: '商户ID',
      dataIndex: 'merchant_id',
      key: 'merchant_id',
      width: 100,
      render: (merchantId: number) => (
        <span className="font-mono text-[#2c4fa3] font-medium">
          HS{String(merchantId).padStart(8, '0')}
        </span>
      ),
      sorter: (a, b) => (a.merchant_id || 0) - (b.merchant_id || 0),
    },

    { 
      title: '商户名称', 
      dataIndex: 'merchant_name', 
      key: 'merchant_name', 
      width: 120, 
      ellipsis: true,
      // ✅【修改】添加筛选功能

      // ✅【修复】过滤掉null/undefined值，确保value为string类型
      filters: Array.from(new Set(pendingList.map(item => item.merchant_name).filter((name): name is string => name != null))).map(name => ({
        text: name,
        value: name,
      })),
      // ✅【修复】添加安全的条件判断
      onFilter: (value, record) => record.merchant_name ? record.merchant_name.indexOf(value as string) === 0 : false,
      filterSearch: true,
    },

    { 
      title: '酒店名称', 
      dataIndex: 'name', 
      key: 'name', 
      ellipsis: true, 
      width: 140,
      // ✅【修改】添加筛选功能
      
      // ✅【修复】过滤掉null/undefined值，确保value为string类型
      filters: Array.from(new Set(pendingList.map(item => item.name).filter((name): name is string => name != null))).map(name => ({
        text: name,
        value: name,
      })),
      // ✅【修复】添加安全的条件判断
      onFilter: (value, record) => record.name ? record.name.indexOf(value as string) === 0 : false,
      filterSearch: true,

    },

    { 
      title: '城市', 
      dataIndex: 'city', 
      key: 'city', 
      width: 100,
      // ✅【修改】添加筛选功能
      
       // ✅【修复】过滤掉null/undefined值，确保value为string类型
      filters: Array.from(new Set(pendingList.map(item => item.city).filter((city): city is string => city != null))).map(city => ({
        text: city,
        value: city,
      })),
      // ✅【修复】添加安全的条件判断
      onFilter: (value, record) => record.city ? record.city.indexOf(value as string) === 0 : false,
      filterSearch: true,
    },

    {
      title: '起步价',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (v: number | null) => (v != null ? `¥${v}` : '-'),
      // ✅【修改】添加排序功能
      sorter: (a, b) => (a.price || 0) - (b.price || 0),
      sortDirections: ['ascend', 'descend', 'ascend'],
    },

    {
      title: '星级',
      dataIndex: 'star_level',
      key: 'star_level',
      width: 80,
      //render: (v: number | null) => (v != null ? `${v}星` : '-'),
      render: (v: number | null) => {
        if (v == null) return '-';
        return (
          <div className="flex items-center">
            <span className="text-[#33C7F7] text-base">
              {'★'.repeat(v)}
            </span>
            {v < 5 && <span className="text-gray-300 text-base">
              {'★'.repeat(5 - v)}
            </span>}
          </div>
        );
      },
      // ✅【修改】添加筛选功能
      
      // ✅【修复】过滤掉null/undefined值，确保value为number类型
      filters: Array.from(new Set(pendingList.map(item => item.star_level).filter((star): star is number => star != null))).map(star => ({
        // ✅【修改】filters 中的 text 函数：将筛选菜单中的文字改为星星图标
      text: (
        <div className="flex items-center">
          <span className="text-[#33C7F7] text-base">{'★'.repeat(star)}</span>
          {star < 5 && <span className="text-gray-300">{'★'.repeat(5 - star)}</span>}
          <span className="ml-1">({star}星)</span>
        </div>
      ),
        value: star,
      })),
      onFilter: (value, record) => record.star_level === value,
    },

    {
      title: '操作',
      key: 'action',
      width: 260,
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => viewDetail(record.id)}>
            查看信息
          </Button>
          {/* ✅【修改】将通过的文字按钮改为标签样式，保持蓝色 */}
          <Button 
            type="primary" 
            size="small" 
            //icon={<CheckOutlined />} 
            onClick={() => handleApprove(record)}
            className="rounded-full shadow-sm hover:shadow-md hover:shadow-red-200/50 transition-all duration-200"
            style={{ backgroundColor: '#33C7F7', borderColor: '#33C7F7' }}
          >
            通过
          </Button>
          {/* ✅【修改】将拒绝的文字按钮改为标签样式，带阴影效果 */}
          <Button 
            type="primary" 
            size="small" 
            danger 
            //icon={<CloseOutlined />} 
            onClick={() => openRejectModal(record)}
            className="rounded-full shadow-sm hover:shadow-md hover:shadow-red-200/50 transition-all duration-200"
          >
            拒绝
          </Button>
        </Space>
      ),
    },
  ]

  // ✅【修改】添加表格变化处理函数
  const handlePublishedTableChange: TableProps<AdminHotelItem>['onChange'] = (pagination, filters, sorter, extra) => {
    setPublishedTableParams({
      pagination,
      filters,
      sorter,
    });
    
    // 可以在这里处理筛选后的数据
    console.log('Published table params:', pagination, filters, sorter, extra);
  };

  const handlePendingTableChange: TableProps<AdminPendingHotelItem>['onChange'] = (pagination, filters, sorter, extra) => {
    setPendingTableParams({
      pagination,
      filters,
      sorter,
    });
    
    // 可以在这里处理筛选后的数据
    console.log('Pending table params:', pagination, filters, sorter, extra);
  };
  const avatarDisplay = avatarPreviewUrl || profile?.avatar || defaultAvatar

  return (
  <div className="relative h-screen flex-1 overflow-hidden">
    {/* 背景图 - 放在最外层 */}
    <div
      className="pointer-events-none fixed inset-0 -z-10 bg-center bg-no-repeat"  // 使用 fixed 替代 absolute
      style={{ 
        backgroundImage: `url(${pageBg})`,
        backgroundSize: 'cover',  // 使用 cover 确保覆盖整个视口
        backgroundAttachment: 'fixed',  // 固定背景，不随滚动移动
        height: '100vh',  // 明确指定高度为视口高度
        width: '100vw',   // 明确指定宽度为视口宽度
      }}
      aria-hidden
    />

    {/* 左右布局容器 */}
    <div className="flex h-full flex-col lg:flex-row">
      {/* ========== 左侧个人信息栏（在 PageLayout 外部） ========== */}
      <aside className="w-full lg:w-1/5 lg:min-w-[280px] h-full overflow-hidden">
        <div
          className="relative h-full overflow-hidden shadow-[0_18px_45px_rgba(20,36,90,0.28)] lg:min-h-[calc(100vh-56px)]"
          style={{ 
            background: `url(${sidebarBg}) no-repeat center / cover`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-[#1e4fba]/70 to-[#9d5ed8]/55" />
          <div className="relative z-10 flex min-h-[420px] flex-col p-4 text-white lg:min-h-[calc(100vh-56px)]">
            
            {/* 编辑密码模式 */}
            {editingPassword ? (
              <div className="mx-auto mt-4 w-full max-w-[260px] flex flex-col h-full">
                <div className="flex-1">
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
                
              </div>
            
            ) : editingProfile ? (
              <div className="mx-auto mt-4 w-full max-w-[240px] flex flex-col h-full">
                <div className="flex-1 text-center">
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

                  <div className="mt-6 text-left text-sm font-medium text-white/90">管理员名称</div>
                  <Input
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    maxLength={30}
                    placeholder="请输入管理员名称"
                    className="mt-2 h-11 rounded-lg border-white/60 bg-white/90 text-center text-lg font-semibold text-[#1f3f95]"
                  />
                </div>
                
              </div>
            
            ) : (
              <>
                <div className="mb-4 flex flex-col items-center text-center">
                  <img
                    src={avatarDisplay}
                    alt="avatar"
                    className="h-24 w-24 rounded-full border-4 border-white/30 object-cover shadow-lg"
                  />
                  <h3 className="mb-0 mt-2 text-2xl font-bold">欢迎，{profile?.username || user?.username || '管理员'}</h3>
                  <p className="m-0 text-xs text-white/80">酒店管理专家</p>
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl bg-white/22 p-3 backdrop-blur-sm">
                    <div className="text-xs text-white/80">管理员ID</div>
                    <div className="mt-1 text-lg font-semibold">
                      AD{String(profile?.id || user?.id || '').padStart(8, '0')}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/22 p-3 backdrop-blur-sm">
                    <div className="text-xs text-white/80">注册时间</div>
                    <div className="mt-1 text-lg font-semibold">{formatDate(profile?.created_at)}</div>
                  </div>
                  <div className="rounded-xl bg-white/22 p-3 backdrop-blur-sm">
                    <div className="text-xs text-white/80">联系电话</div>
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

             {/* ========== 底部公共按钮区域 ========== */}
            <div className="mt-auto pt-4">
              {editingProfile ? (
                // 编辑资料模式按钮
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
                // 编辑密码模式按钮
                <div className="space-y-3">
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
                </div>
              ) : (
                // 非编辑模式按钮
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

      {/* ========== 右侧酒店管理内容区（放在 PageLayout 内部） ========== */}
      <main className="w-full lg:w-4/5 p-6 md:p-8 ">
        <div className="relative z-20">
          <div className="p-6 bg-white/90 backdrop-blur-sm rounded-2xl shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="m-0 text-2xl font-bold tracking-tight text-gray-800 md:text-3xl">酒店管理</h1>
                <p className="mb-0 mt-1 text-sm text-gray-500">
                  共 {publishedList.length + pendingList.length} 家酒店
                </p>
              </div>
            </div>

            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={[
                {
                  key: 'published',
                  label: '已发布',
                  children: (
                    <>
                      <div className="mb-3 flex justify-end">
                        <Button type="default" icon={<SyncOutlined />} onClick={loadPublished} loading={loadingPublished}>
                          刷新
                        </Button>
                      </div>
                      {/* 表格容器添加最大高度和滚动 */}
                      <div className="max-h-[calc(100vh-350px)] overflow-y-auto rounded-lg">
                        <Table<AdminHotelItem>
                          rowKey="id"
                          columns={publishedColumns}
                          dataSource={filteredPublishedList}
                          loading={loadingPublished}
                          rowClassName={(record) => (record.status === STATUS_OFFLINE ? 'bg-gray-100' : '')}
                          pagination={publishedTableParams.pagination}
                          onChange={handlePublishedTableChange}
                          showSorterTooltip={{ target: 'sorter-icon' }}
                          locale={{ emptyText: '暂无已发布酒店' }}
                          scroll={{ x: 'max-content', y: 'calc(100vh-450px)' }}
                        />
                      </div>
                    </>
                  ),
                },
                {
                  key: 'pending',
                  label: '待审核',
                  children: (
                    <div className="max-h-[calc(100vh-300px)] overflow-y-auto rounded-lg">
                      <Table<AdminPendingHotelItem>
                        rowKey="id"
                        columns={pendingColumns}
                        dataSource={filteredPendingList}
                        loading={loadingPending}
                        pagination={pendingTableParams.pagination}
                        onChange={handlePendingTableChange}
                        showSorterTooltip={{ target: 'sorter-icon' }}
                        locale={{ emptyText: '暂无待审核酒店' }}
                        scroll={{ x: 'max-content', y: 'calc(100vh-400px)' }}
                      />
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </div>
      </main>
    </div>

    {/* 弹窗组件 - 放在最外层 */}
    <Modal
      title="下线原因"
      open={offlineModalOpen}
      onCancel={closeOfflineModal}
      footer={[
        <Button key="cancel" onClick={closeOfflineModal}>
          取消
        </Button>,
        <Button key="submit" type="primary" loading={offlineSubmitting} onClick={submitOffline}>
          提交
        </Button>,
      ]}
      destroyOnClose
      width={420}
      className="admin-reason-modal"
    >
      <Input.TextArea
        placeholder="请输入下线原因（选填）"
        value={offlineReason}
        onChange={(e) => setOfflineReason(e.target.value)}
        rows={4}
        className="mt-2 rounded-lg"
      />
    </Modal>

    <Modal
      title="拒绝原因"
      open={rejectModalOpen}
      onCancel={closeRejectModal}
      footer={[
        <Button key="cancel" onClick={closeRejectModal}>
          取消
        </Button>,
        <Button key="submit" type="primary" danger loading={rejectSubmitting} onClick={submitReject}>
          提交
        </Button>,
      ]}
      destroyOnClose
      width={420}
      className="admin-reason-modal"
    >
      <Input.TextArea
        placeholder="请输入拒绝原因（选填）"
        value={rejectReason}
        onChange={(e) => setRejectReason(e.target.value)}
        rows={4}
        className="mt-2 rounded-lg"
      />
    </Modal>
  </div>
  )
}