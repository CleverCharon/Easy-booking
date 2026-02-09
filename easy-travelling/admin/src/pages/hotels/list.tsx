import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Table, Button, Space, Modal } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, RollbackOutlined, EditOutlined, DeleteOutlined, StopOutlined, EyeOutlined } from '@ant-design/icons'
import PageLayout from '../../components/PageLayout'
import { getMyHotels, withdrawHotel, deleteHotel, type HotelItem } from '../../api/hotels'
import { getUser } from '../../utils/auth'
import { toast } from '../../utils/toast'

const STATUS_MAP: Record<number, string> = {
  0: '待审核',
  1: '已发布',
  2: '已拒绝',
  3: '已下线',
}

export default function HotelListPage() {
  const navigate = useNavigate()
  const user = getUser()
  const [list, setList] = useState<HotelItem[]>([])
  const [loading, setLoading] = useState(true)

  const loadList = () => {
    if (!user || user.role !== 'merchant') return
    setLoading(true)
    getMyHotels()
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : '加载失败')
        setList([])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!user || user.role !== 'merchant') {
      setLoading(false)
      navigate('/login', { replace: true })
      return
    }
    loadList()
  }, [user?.id, navigate])

  const handleWithdraw = (record: HotelItem) => {
    Modal.confirm({
      title: '确认退回申请？',
      content: `确定要退回「${record.name}」的申请吗？退回后该行将变为灰色，可重新发布或删除。`,
      okText: '确定',
      cancelText: '取消',
      onOk: () => {
        withdrawHotel(record.id)
          .then(() => {
            toast.success('已退回申请')
            loadList()
          })
          .catch((e) => toast.error(e instanceof Error ? e.message : '操作失败'))
      },
    })
  }

  const handleDelete = (record: HotelItem, actionName: string) => {
    Modal.confirm({
      title: `确认${actionName}？`,
      content: `「${record.name}」将被永久删除，且无法恢复。`,
      okText: '确定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        deleteHotel(record.id)
          .then(() => {
            toast.success('已删除')
            loadList()
          })
          .catch((e) => toast.error(e instanceof Error ? e.message : '操作失败'))
      },
    })
  }

  const columns: ColumnsType<HotelItem> = [
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
      render: (status: number) => STATUS_MAP[status] ?? '未知',
    },
    {
      title: '操作',
      key: 'action',
      width: 320,
      render: (_, record) => {
        const status = record.status
        const viewBtn = (
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/hotels/publish?id=${record.id}&view=1`)}
          >
            查看信息
          </Button>
        )
        if (status === 0) {
          return (
            <Space size="small">
              <Button type="link" size="small" icon={<RollbackOutlined />} onClick={() => handleWithdraw(record)}>
                退回申请
              </Button>
              {viewBtn}
            </Space>
          )
        }
        if (status === 1) {
          return (
            <Space size="small">
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => navigate(`/hotels/publish?id=${record.id}`)}
              >
                编辑并重新发布
              </Button>
              <Button type="link" size="small" danger icon={<StopOutlined />} onClick={() => handleDelete(record, '下架')}>
                下架
              </Button>
              {viewBtn}
            </Space>
          )
        }
        if (status === 2) {
          return (
            <Space size="small">
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => navigate(`/hotels/publish?id=${record.id}`)}
              >
                重新发布
              </Button>
              <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record, '删除')}>
                删除
              </Button>
              {viewBtn}
            </Space>
          )
        }
        if (status === 3) {
          return (
            <Space size="small">
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => navigate(`/hotels/publish?id=${record.id}`)}
              >
                重新发布
              </Button>
              <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record, '删除')}>
                删除
              </Button>
              {viewBtn}
            </Space>
          )
        }
        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => navigate(`/hotels/publish?id=${record.id}`)}
            >
              重新发布
            </Button>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record, '删除')}>
              删除
            </Button>
            {viewBtn}
          </Space>
        )
      },
    },
  ]

  return (
    <PageLayout semiTransparent maxWidth="1100px">
      <div className="p-8 pb-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="m-0 text-[24px] font-semibold text-gray-800 tracking-tight" style={{ color: '#1f2937' }}>
            我的酒店
          </h1>
          <Link to="/hotels/publish">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="large"
              className="rounded-xl font-medium shadow-md hover:shadow-lg transition-shadow border-0"
              style={{ background: 'linear-gradient(135deg, #32bcef 0%, #2c4fa3 100%)' }}
            >
              发布酒店
            </Button>
          </Link>
        </div>
        <Table<HotelItem>
          rowKey="id"
          columns={columns}
          dataSource={list}
          loading={loading}
          rowClassName={(record) => (record.status === 2 || record.status === 3 ? 'bg-gray-100' : '')}
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `共 ${t} 条` }}
          className="hotel-table"
          locale={{ emptyText: '暂无酒店，点击「发布酒店」添加' }}
        />
      </div>
    </PageLayout>
  )
}
