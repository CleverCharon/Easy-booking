import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Button, Space, Tabs, Modal, Input } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { EyeOutlined, StopOutlined, DeleteOutlined, CheckOutlined, CloseOutlined, SyncOutlined } from '@ant-design/icons'
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
import { getUser } from '../../utils/auth'
import { toast } from '../../utils/toast'

const STATUS_PUBLISHED = 1
const STATUS_OFFLINE = 3

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

  const loadPublished = () => {
    setLoadingPublished(true)
    getPublishedHotels()
      .then((data) => setPublishedList(Array.isArray(data) ? data : []))
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : '加载失败')
        setPublishedList([])
      })
      .finally(() => setLoadingPublished(false))
  }

  const loadPending = () => {
    setLoadingPending(true)
    getPendingHotels()
      .then((data) => setPendingList(Array.isArray(data) ? data : []))
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : '加载失败')
        setPendingList([])
      })
      .finally(() => setLoadingPending(false))
  }

  useEffect(() => {
    if (!user || user.role !== 'admin') return
    loadPublished()
    loadPending()
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

  const publishedColumns: ColumnsType<AdminHotelItem> = [
    { title: '商户名称', dataIndex: 'merchant_name', key: 'merchant_name', width: 120, ellipsis: true },
    { title: '酒店名称', dataIndex: 'name', key: 'name', ellipsis: true, width: 160 },
    { title: '城市', dataIndex: 'city', key: 'city', width: 100 },
    {
      title: '起步价',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (v: number | null) => (v != null ? `¥${v}` : '-'),
    },
    {
      title: '星级',
      dataIndex: 'star_level',
      key: 'star_level',
      width: 80,
      render: (v: number | null) => (v != null ? `${v}星` : '-'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: number) => (s === STATUS_PUBLISHED ? '已发布' : '已下线'),
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
            <Button type="link" size="small" danger icon={<StopOutlined />} onClick={() => openOfflineModal(record)}>
              下线
            </Button>
          </Space>
        )
      },
    },
  ]

  const pendingColumns: ColumnsType<AdminPendingHotelItem> = [
    { title: '商户名称', dataIndex: 'merchant_name', key: 'merchant_name', width: 120, ellipsis: true },
    { title: '酒店名称', dataIndex: 'name', key: 'name', ellipsis: true, width: 140 },
    { title: '城市', dataIndex: 'city', key: 'city', width: 100 },
    {
      title: '起步价',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (v: number | null) => (v != null ? `¥${v}` : '-'),
    },
    {
      title: '星级',
      dataIndex: 'star_level',
      key: 'star_level',
      width: 80,
      render: (v: number | null) => (v != null ? `${v}星` : '-'),
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
          <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => handleApprove(record)}>
            通过
          </Button>
          <Button type="link" size="small" danger icon={<CloseOutlined />} onClick={() => openRejectModal(record)}>
            拒绝
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <PageLayout semiTransparent maxWidth="1200px">
      <div className="p-8 pb-10">
        <h1 className="m-0 mb-6 text-[24px] font-semibold text-gray-800 tracking-tight" style={{ color: '#1f2937' }}>
          酒店管理
        </h1>
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
                  <Table<AdminHotelItem>
                    rowKey="id"
                    columns={publishedColumns}
                    dataSource={publishedList}
                    loading={loadingPublished}
                    rowClassName={(record) => (record.status === STATUS_OFFLINE ? 'bg-gray-100' : '')}
                    pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `共 ${t} 条` }}
                    locale={{ emptyText: '暂无已发布酒店' }}
                  />
                </>
              ),
            },
            {
              key: 'pending',
              label: '待审核',
              children: (
                <Table<AdminPendingHotelItem>
                  rowKey="id"
                  columns={pendingColumns}
                  dataSource={pendingList}
                  loading={loadingPending}
                  pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `共 ${t} 条` }}
                  locale={{ emptyText: '暂无待审核酒店' }}
                />
              ),
            },
          ]}
        />

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
    </PageLayout>
  )
}
