import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

import { Button, Space, Modal, Collapse, Rate, Tag } from 'antd'
import type { CollapseProps } from 'antd'
import { PlusOutlined, RollbackOutlined, EditOutlined, DeleteOutlined, StopOutlined, EyeOutlined,CaretRightOutlined,StarFilled,EnvironmentOutlined,DollarOutlined,HomeOutlined,TagOutlined} from '@ant-design/icons'

import PageLayout from '../../components/PageLayout'
import { getMyHotels, withdrawHotel, deleteHotel, getHotelDetail, type HotelItem } from '../../api/hotels'
import { getUser } from '../../utils/auth'
import { toast } from '../../utils/toast'

//修改部分

import defaultHotelImg from '../../img/hotel-defalt.jpg'

// 1.  首先定义 StatusConfig 类型
interface StatusConfig {
  text: string
  color: 'success' | 'processing' | 'error' | 'default' | 'warning'
}

const STATUS_CONFIG: Record<number, StatusConfig> = {
  0: { text: '待审核', color: 'processing' },
  1: { text: '已发布', color: 'success' },
  2: { text: '已拒绝', color: 'error' },
  3: { text: '已下线', color: 'default' },
}

export default function HotelListPage() {
  const navigate = useNavigate()
  const user = getUser()
  const [list, setList] = useState<HotelItem[]>([])
  const [loading, setLoading] = useState(true)

  //添加这行 - 控制折叠面板的展开状态
  const [activeKeys, setActiveKeys] = useState<string[]>([])

  const loadList = () => {
  if (!user || user.role !== 'merchant') return
  setLoading(true)
  getMyHotels()
    .then(async (data) => {
      const hotelList = Array.isArray(data) ? data : []
      
      // 并行加载所有酒店的房型信息
      const promises = hotelList.map(async (hotel) => {
        try {
          const detail = await getHotelDetail(hotel.id)
          return { ...hotel, roomTypes: detail.roomTypes }
        } catch {
          return hotel  // 加载失败时返回原数据
        }
      })
      
      const hotelListWithRooms = await Promise.all(promises)
      setList(hotelListWithRooms)
    })
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

{/*开始修改代码 */}



{/*修改代码 */}

// 状态标签使用 STATUS_CONFIG 
  const getStatusTag = (status: number) => {
    const config = STATUS_CONFIG[status]
    return <Tag color={config?.color ?? 'default'} 
    className="..."
    >
      {config?.text ?? '未知'}
    </Tag>
  }


  // 获取起步价显示
  const getPriceText = (record: HotelItem) => {
    if (record.price != null) return `¥${record.price}/晚起`
    // 如果有房型数据，可以从房型中取最低价
    return '价格待定'
  }

  // 获取酒店图片（模拟）
  const getHotelImage = (record: HotelItem) => {
  // 优先使用 API 返回的图片
     
    if (record.image_url) {
      return record.image_url
    }
    // 没有图片时使用本地默认图片
    return defaultHotelImg
  // 或者使用 public 目录图片：return '/images/default-hotel.jpg'
  }

  const loadHotelDetail = async (hotelId: number) => {
    try {
      const detail = await getHotelDetail(hotelId)
      return detail
    } catch (e) {
      console.error('加载酒店详情失败', e)
      return null
    }
  }

  // 然后在点击展开时调用
  const handleExpand = (keys: string | string[]) => {  // ← 移除 async
  const newActiveKeys = Array.isArray(keys) ? keys : [keys]
  setActiveKeys(newActiveKeys)
  
  // 当展开卡片时，加载房型信息（异步处理，不阻塞 onChange）
  if (newActiveKeys.length > 0) {
    const hotelId = parseInt(newActiveKeys[0])
    const hotel = list.find(h => h.id === hotelId)
    if (hotel && !hotel.roomTypes) {
      // 异步加载，不等待
      loadHotelDetail(hotelId).then(detail => {
        if (detail) {
          setList(prev => prev.map(h => 
            h.id === hotelId ? { ...h, roomTypes: detail.roomTypes } : h
          ))
        }
      })
    }
  }
}

  // 生成折叠面板的items
  const getCollapseItems = (): CollapseProps['items'] => {
    return list.map((hotel) => ({
      key: String(hotel.id),
      label: (
        <div className="flex items-center py-2">
          {/* 酒店缩略图 */}
          <div className="flex-shrink-0 mr-4">
            <img
              src={getHotelImage(hotel)}
              alt={hotel.name}
              className="w-20 h-14 rounded-lg object-cover border border-gray-100"
            />
          </div>
          
          {/* 酒店核心信息 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-3 mb-1">
              <h3 className="text-lg font-semibold m-0 truncate max-w-[200px]" 
                  style={{ color: '#2C4398' }}>
                {hotel.name}
              </h3>
              
              {/* 星级评分 - 蓝色星星 */}
              {hotel.star_level && (
                <Rate 
                  disabled 
                  value={hotel.star_level} 
                  character={<StarFilled />} 
                  className="text-blue-400 text-sm"
                />
              )}

              {/* 状态标签 - 胶囊设计 */}
              {getStatusTag(hotel.status)}
            </div>
            
            <div className="flex items-center text-gray-500 text-sm">
              <EnvironmentOutlined className="mr-1 text-gray-400" />
              <span className="truncate max-w-md">
                {hotel.city || '未设置城市'}
              </span>
            </div>
          </div>

          {/* 起步价 */}
          <div className="flex-shrink-0 ml-4 text-right">
            <div className="text-xs text-gray-400 mb-0.5">起步价</div>
            <div className="text-lg font-semibold" style={{ color: '#2c4fa3' }}>
              {getPriceText(hotel)}
            </div>
          </div>
        </div>
      ),
      children: (
        <div className="px-2 pb-4 space-y-4">
          {/* 详细地址 */}
          {hotel.address && (
            <div className="flex items-start gap-2 mb-4 text-gray-600 bg-gray-50 p-3 rounded-lg">
              <HomeOutlined className="mt-0.5 text-gray-400" />
              <span className="text-sm flex-1">{hotel.address}</span>
            </div>
          )}

          {/* 联系电话 - 灰色小字 */}
    {hotel.phone && (
      <div className="flex items-center gap-2 text-gray-400 text-xs">
        <span>联系电话</span>
        <span>{hotel.phone}</span>
      </div>
    )}

    {/* 房型和价格标签 */}
    {hotel.roomTypes && hotel.roomTypes.length > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          {hotel.roomTypes.map((room, index) => (
            <div key={index} className="flex items-center gap-4">
              {/* 房型名称标签 */}
              <span
                className="px-4 py-1.5 rounded-full text-sm font-medium text-white"
                style={{ backgroundColor: '#33C7F7' }}
              >
                {room.name}
              </span>
              {/* 价格标签 */}
              <span
                className="px-4 py-1.5 rounded-full text-sm font-medium text-white"
                style={{ backgroundColor: '#33C7F7' }}
              >
                ¥{room.price}/晚
              </span>
            </div>
          ))}
        </div>
    )}

    {/* 操作按钮区 - 放在最底部 */}
    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
      <div className="flex items-center gap-4">
        {/* 起步价信息 */}
        <span className="text-sm text-gray-500">
          <DollarOutlined className="mr-1" />
          起步价 {getPriceText(hotel)}
        </span>
      </div>
      
      {/* 操作按钮组 */}
      <Space size="middle">
        {renderActionButtons(hotel)}
      </Space>
     </div>
    </div>
      ),
      className: `bg-white rounded-none mb-6 
                  overflow-hidden shadow-sm 
                  border-0  
                  hover:shadow-[0_8px_25px_rgba(44,67,155,0.6)]
                  transition-shadow border-0 
                  ${hotel.status === 2 || hotel.status === 3 ? 'opacity-75' : ''
      }`,
      //style: { border: 'none' }
    }))
  }
// 抽离操作按钮渲染逻辑（完全复用原代码）
  const renderActionButtons = (record: HotelItem) => {
    const status = record.status
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

    if (status === 0) {
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
    if (status === 1) {
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
    if (status === 2 || status === 3) {
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

  return (
    <PageLayout semiTransparent maxWidth="1200px">
      <div className="p-6 pb-10">
        {/* 头部：标题 + 发布按钮 - 完全保持原样 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 tracking-tight m-0">
              我的酒店
            </h1>
            <p className="text-gray-500 mt-1 mb-0 text-sm">
              共 {list.length} 家酒店，点击卡片可展开操作
            </p>
          </div>
          <Link to="/hotels/publish">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="large"
              className="h-11 px-6 rounded-xl font-medium shadow-md hover:shadow-lg transition-shadow border-0 flex items-center"
              style={{ background: 'linear-gradient(135deg, #32bcef 0%, #2c4fa3 100%)' }}
            >
              发布酒店
            </Button>
          </Link>
        </div>

        {/* 酒店列表 - 折叠卡片形式 */}
        {list.length === 0 ? (
          /* 空状态 - 保持原空文本但样式优化 */
          <div className="bg-white rounded-none p-16 text-center shadow-sm">
            <div className="text-gray-300 text-7xl mb-4">🏨</div>
            <h3 className="text-xl font-medium text-gray-600 mb-2">暂无酒店</h3>
            <p className="text-gray-400 mb-6">点击「发布酒店」按钮，开始添加您的第一家酒店</p>
            <Link to="/hotels/publish">
              <Button
                type="primary"
                icon={<PlusOutlined />}
                className="h-10 px-5 rounded-lg"
                style={{ background: 'linear-gradient(135deg, #32bcef 0%, #2c4fa3 100%)' }}
              >
                立即发布
              </Button>
            </Link>
          </div>
        ) : (
          /* 折叠卡片列表 */
          <Collapse
            items={getCollapseItems()}
            activeKey={activeKeys}
            onChange={handleExpand}
            expandIcon={({ isActive }) => (
              <span 
                className={`
                  inline-block w-2 h-2 mr-3 rounded-full 
                  ${isActive ? 'bg-[#2c4fa3]' : 'bg-[#33C7F7]'}
                  transition-colors duration-200
               `}
              />
            )}
             expandIconPlacement="start"
             className="bg-transparent border-0 [&_.ant-collapse-item]:!rounded-none [&_.ant-collapse-content]:!rounded-none"
            ghost
          />
        )}

        {/* 品牌水印 - 易宿 Yi Su */}
        <div className="fixed bottom-8 right-8 text-7xl font-bold opacity-5 pointer-events-none select-none"
             style={{ color: '#2c4fa3' }}>
          <div className="tracking-[12px]">易宿</div>
          <div className="text-base mt-2 text-right">Yi Su</div>
        </div>
      </div>
    </PageLayout>
  )
}