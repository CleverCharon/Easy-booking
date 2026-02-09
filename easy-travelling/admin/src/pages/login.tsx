/// <reference types="vite/client" />
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tabs, Input, Button, Checkbox, Form, Select } from 'antd'
import type { FormProps } from 'antd'
import {
  UserOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
  RiseOutlined,
} from '@ant-design/icons'
import bgImg from '../img/bg-1.png'
import { login as apiLogin, register as apiRegister } from '../api/auth'
import { setToken, setUser } from '../utils/auth'
import { toast } from '../utils/toast'

type TabKey = 'login' | 'register'

interface LoginFormValues {
  username: string
  password: string
  remember?: boolean
}

interface RegisterFormValues {
  username: string
  password: string
  confirmPassword: string
  role: 'merchant' | 'admin'
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabKey>('login')
  const [loginLoading, setLoginLoading] = useState(false)
  const [registerLoading, setRegisterLoading] = useState(false)
  const [loginForm] = Form.useForm<LoginFormValues>()
  const [registerForm] = Form.useForm<RegisterFormValues>()

  const onLoginFinish: FormProps<LoginFormValues>['onFinish'] = async (values) => {
    setLoginLoading(true)
    try {
      const res = await apiLogin({ username: values.username, password: values.password })
      setToken(res.token!)
      setUser(res.user!)
      toast.success(res.message || '登录成功')
      navigate(res.user?.role === 'admin' ? '/admin' : '/hotels', { replace: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '登录失败')
    } finally {
      setLoginLoading(false)
    }
  }

  const onRegisterFinish: FormProps<RegisterFormValues>['onFinish'] = async (values) => {
    setRegisterLoading(true)
    try {
      await apiRegister({
        username: values.username,
        password: values.password,
        role: values.role,
      })
      toast.success('注册成功，请登录')
      registerForm.resetFields()
      setActiveTab('login')
      loginForm.setFieldValue('username', values.username)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '注册失败')
    } finally {
      setRegisterLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 box-border relative overflow-hidden bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${bgImg})` }}
    >
      {/* 可选：一层很轻的渐变蒙版，与主题色呼应且不遮挡背景图 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, rgba(50,188,239,0.08) 0%, rgba(44,79,163,0.12) 100%)`,
        }}
        aria-hidden
      />
      <div className="w-full max-w-[960px] min-h-[580px] rounded-[24px] overflow-hidden flex bg-white relative z-10 shadow-[0_25px_80px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.08)_inset]">
        {/* 左侧：品牌与介绍，与页面同向渐变 */}
        <div
          className="w-[380px] shrink-0 py-14 px-10 flex flex-col items-center justify-center text-center"
          style={{
            background: `linear-gradient(135deg, #32bcef 0%, #2c4fa3 100%)`,
          }}
        >
          <div>
            <h1 className="m-0 text-[44px] font-bold text-white tracking-[6px] drop-shadow-sm">易宿</h1>
            <p className="mt-2 text-base text-white/90 font-normal tracking-wide">Yi Su</p>
            <p className="mt-2 text-[15px] text-white/80 tracking-wide">易宿管理端</p>
          </div>
          <div className="mt-12 w-full max-w-[280px] rounded-2xl py-6 px-5 backdrop-blur-md bg-white/10 border border-white/20 shadow-lg">
            <div className="flex items-center gap-3 text-white text-sm py-3 border-b border-white/20">
              <SafetyCertificateOutlined className="text-lg shrink-0 text-white/95" />
              <span className="font-medium">安全可靠的企业级服务</span>
            </div>
            <div className="flex items-center gap-3 text-white text-sm py-3 border-b border-white/20">
              <SyncOutlined className="text-lg shrink-0 text-white/95" />
              <span className="font-medium">实时同步的管理系统</span>
            </div>
            <div className="flex items-center gap-3 text-white text-sm py-3">
              <RiseOutlined className="text-lg shrink-0 text-white/95" />
              <span className="font-medium">智能数据分析平台</span>
            </div>
          </div>
          <p className="mt-auto pt-10 text-xs text-white/60 self-start tracking-wide">© 2026 易宿管理端 V15 版权所有</p>
        </div>

        {/* 右侧：登录/注册表单 */}
        <div className="flex-1 min-w-0 pt-14 pr-14 pl-14 pb-10 flex flex-col bg-gray-50/50">
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as TabKey)}
            className="login-tabs"
            items={[
              {
                key: 'login',
                label: '登录',
                children: (
                  <>
                    <h2 className="m-0 mb-8 text-[24px] font-semibold text-gray-800 tracking-tight">欢迎回来</h2>
                    <Form
                      form={loginForm}
                      layout="vertical"
                      requiredMark={false}
                      onFinish={onLoginFinish}
                      className="[&_.ant-form-item]:mb-5 [&_.ant-form-item-label_label]:text-sm [&_.ant-form-item-label_label]:text-gray-700 [&_.ant-form-item-label_label]:font-medium"
                    >
                      <Form.Item
                        name="username"
                        label="账号"
                        rules={[{ required: true, message: '请输入您的账号' }]}
                      >
                        <Input
                          placeholder="请输入您的账号"
                          prefix={<UserOutlined className="text-[#bfbfbf] text-base" />}
                          size="large"
                          className="input-rounded"
                        />
                      </Form.Item>
                      <Form.Item
                        name="password"
                        label="密码"
                        rules={[{ required: true, message: '请输入您的密码' }]}
                      >
                        <Input.Password
                          placeholder="请输入您的密码"
                          prefix={<LockOutlined className="text-[#bfbfbf] text-base" />}
                          size="large"
                          className="input-rounded"
                        />
                      </Form.Item>
                      <div className="flex items-center justify-between mb-6">
                        <Form.Item name="remember" valuePropName="checked" noStyle>
                          <Checkbox>记住我</Checkbox>
                        </Form.Item>
                        <a href="#" className="text-[#2c4fa3] text-sm font-medium hover:text-[#32bcef] transition-colors">忘记密码?</a>
                      </div>
                      <Form.Item className="mb-0 mt-2">
                        <Button
                          type="primary"
                          htmlType="submit"
                          size="large"
                          block
                          loading={loginLoading}
                          className="h-12 text-base font-medium rounded-xl border-0 shadow-md hover:shadow-lg transition-shadow"
                          style={{ background: 'linear-gradient(135deg, #32bcef 0%, #2c4fa3 100%)' }}
                        >
                          登录
                        </Button>
                      </Form.Item>
                    </Form>
                  </>
                ),
              },
              {
                key: 'register',
                label: '注册',
                children: (
                  <>
                    <h2 className="m-0 mb-8 text-[24px] font-semibold text-gray-800 tracking-tight">创建账号</h2>
                    <Form
                      form={registerForm}
                      layout="vertical"
                      requiredMark={false}
                      onFinish={onRegisterFinish}
                      className="[&_.ant-form-item]:mb-5 [&_.ant-form-item-label_label]:text-sm [&_.ant-form-item-label_label]:text-gray-700 [&_.ant-form-item-label_label]:font-medium"
                    >
                      <Form.Item
                        name="username"
                        label="账号"
                        rules={[{ required: true, message: '请输入账号' }]}
                      >
                        <Input
                          placeholder="请输入账号"
                          prefix={<UserOutlined className="text-[#bfbfbf] text-base" />}
                          size="large"
                          className="input-rounded"
                        />
                      </Form.Item>
                      <Form.Item
                        name="password"
                        label="密码"
                        rules={[{ required: true, message: '请输入密码' }]}
                      >
                        <Input.Password
                          placeholder="请输入密码"
                          prefix={<LockOutlined className="text-[#bfbfbf] text-base" />}
                          size="large"
                          className="input-rounded"
                        />
                      </Form.Item>
                      <Form.Item
                        name="confirmPassword"
                        label="确认密码"
                        dependencies={['password']}
                        rules={[
                          { required: true, message: '请再次输入密码' },
                          ({ getFieldValue }) => ({
                            validator(_, value) {
                              if (!value || getFieldValue('password') === value) {
                                return Promise.resolve()
                              }
                              return Promise.reject(new Error('两次输入的密码不一致'))
                            },
                          }),
                        ]}
                      >
                        <Input.Password
                          placeholder="请再次输入密码"
                          prefix={<LockOutlined className="text-[#bfbfbf] text-base" />}
                          size="large"
                          className="input-rounded"
                        />
                      </Form.Item>
                      <Form.Item
                        name="role"
                        label="角色"
                        rules={[{ required: true, message: '请选择角色' }]}
                      >
                        <Select
                          placeholder="请选择角色"
                          size="large"
                          className="input-rounded"
                          options={[
                            { value: 'merchant', label: '商户' },
                            { value: 'admin', label: '管理员' },
                          ]}
                        />
                      </Form.Item>
                      <Form.Item className="mb-0 mt-2">
                        <Button
                          type="primary"
                          htmlType="submit"
                          size="large"
                          block
                          loading={registerLoading}
                          className="h-12 text-base font-medium rounded-xl border-0 shadow-md hover:shadow-lg transition-shadow"
                          style={{ background: 'linear-gradient(135deg, #32bcef 0%, #2c4fa3 100%)' }}
                        >
                          注册
                        </Button>
                      </Form.Item>
                    </Form>
                  </>
                ),
              },
            ]}
          />
          <p className="mt-auto pt-8 text-[13px] text-gray-500 text-right">
            需要帮助? 请联系<a href="#" className="text-[#2c4fa3] ml-1 font-medium hover:text-[#32bcef] transition-colors">客服支持</a>
          </p>
        </div>
      </div>
    </div>
  )
}
