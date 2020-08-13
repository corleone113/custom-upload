import React, { ChangeEvent, useState, useEffect, useCallback, } from 'react'
import { Col, Input, Button, message, Table, Progress, Row } from 'antd'
import { useRequests, useUploadParts, useCalculateHash, Part, DEFAULT_SIZE } from './uploadHook'

enum UploadStatus { // 上传状态
    INIT, // 初始状态
    PAUSE, // 暂停中
    UPLOADING, // 上传中
}
function Upload() {
    const [currentFile, setCurrentFile] = useState<File|null>() // 上传的文件
    const [objectUrl, setObjectUrl] = useState<string>('') // 为上传的文件创建的对象URL
    const [hashPercent, setHashPercent] = useState<number>(0) // 哈希计算进度百分比
    const [filename, setFilename] = useState<string>('') // 文件名称
    const [partList, setPartList] = useState<Part[]>([]) // 分片数据数组
    const [uploadStatus, setUploadStatus] = useState<UploadStatus>(UploadStatus.INIT) // 上传状态
    const reset = useCallback(() => { // 重置所有状态
        setTimeout(() => {
            setCurrentFile(null)
            setObjectUrl('')
            setUploadStatus(UploadStatus.INIT)
            setPartList([])
            setHashPercent(0)
            setFilename('')
        }, 500)
    }, [setUploadStatus,]) // 只需要依赖一个即可——一个变化了其它的自然也会又变化
    const createRequests = useRequests(setPartList) // 发起请求的回调
    const uploadParts = useUploadParts(createRequests, setPartList, reset) // 分片上传回调
    const calculateHash = useCalculateHash(setHashPercent) // 计算文件hash值的回调
    useEffect(() => {
        if (currentFile) { // 选择文件更新currentUrl
            const currentUrl = URL.createObjectURL(currentFile)
            setObjectUrl(currentUrl)
            return () => URL.revokeObjectURL(currentUrl)
        }
    }, [currentFile])
    const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => { // 选择文件时的监听器函数
        const file: File = event.target.files![0]
        console.log('the file:', file)
        setCurrentFile(file)
    }, [setCurrentFile])
    const handleUpload = useCallback(async () => {
        if (!currentFile) {
            return message.error('尚未选择文件')
        }
        if (!allowUpload(currentFile)) return
        setUploadStatus(UploadStatus.UPLOADING) // 进入“上传中状态
        const partList: Part[] = createChunks(currentFile) // 进行文件分片得到分片数据的数组
        const fileHash = await calculateHash(partList) // 基于文件内容计算hash
        const lastDotIndex = currentFile.name.lastIndexOf('.')
        const extName = currentFile.name.slice(lastDotIndex) // 文件后缀名
        const filename = `${fileHash}${extName}` // 重新构建文件名
        setFilename(filename)
        partList.forEach((part, index) => { // 初始化分片其它信息
            part.filename = filename
            part.chunk_name = `${filename}-${index}`
            part.loaded = 0
            part.percent = 0
        })
        setPartList(partList)
        await uploadParts(partList, filename,) // 开始上传分片文件
    }, [currentFile, calculateHash, setPartList, setFilename, uploadParts,])
    const handlePause = useCallback(() => {
        setUploadStatus(UploadStatus.PAUSE) // 将上传状态改为“暂停”
        partList.forEach((part: Part) => part.xhr && part.xhr.abort()) // 通过中断来实现暂停
    }, [partList, setUploadStatus])
    const handleResume = useCallback(async () => {
        setUploadStatus(UploadStatus.UPLOADING) // 恢复为“上传中”
        await uploadParts(partList, filename,) // 继续上传分片
    }, [setUploadStatus, uploadParts, partList, filename])
    const columns = [
        {
            title: '切片名称',
            dataIndex: 'chunk_name',
            key: 'chunk_name',
            width: '20%',
        },
        {
            title: '上传进度',
            dataIndex: 'percent',
            key: 'percent',
            width: '80%',
            render: (value: number) => <Progress percent={value} />
        },
    ]
    const totalPercent = partList.length > 0 ? partList.reduce((acc: number, curr: Part) => acc + curr.percent!, 0) / partList.length : 0 // 计算总体上传进度百分比
    return (
        <div>
            <Row>
                <Col span={12}>
                    <Input type="file" style={{ width: 300 }} onChange={handleChange} />
                    {uploadStatus === UploadStatus.INIT && <Button type="primary" onClick={handleUpload} style={{ marginLeft: 10 }}>上传</Button>}
                    {uploadStatus === UploadStatus.UPLOADING && <Button type="default" onClick={handlePause} style={{ marginLeft: 10 }}>暂停</Button>}
                    {uploadStatus === UploadStatus.PAUSE && <Button type="ghost" onClick={handleResume} style={{ marginLeft: 10 }}>恢复</Button>}
                </Col>
                <Col span={12}>
                    {objectUrl && <img src={objectUrl} style={{ width: 500 }} alt="暂无图片" />}
                </Col>
            </Row>
            {
                uploadStatus !== UploadStatus.INIT && (
                    <>
                        <Row>
                            <span>解析进度:</span>
                            <Progress percent={hashPercent} />
                        </Row>
                        <Row>
                            <span>总进度:</span>
                            <Progress percent={totalPercent} />
                        </Row>
                        <Table
                            columns={columns}
                            dataSource={partList}
                            rowKey={row => row.chunk_name!}
                        />
                    </>
                )
            }
        </div>
    )
}
const validFileTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4']
function allowUpload(file: File) { // 校验上传文件的类型的大小是否合法
    const { type, size } = file
    if (!validFileTypes.includes(type)) {
        message.error('不支持上传的文件类型')
        return false
    }
    const isLessThan2G = size < 1024 * 1024 * 1024 * 2
    if (!isLessThan2G) {
        message.error('上传文件大小不能大于2G')
        return false
    }
    return true
}
function createChunks(file: File): Part[] { // 创建分片数据数组
    let current = 0
    const { size } = file
    const partList: Part[] = []
    while (current < size) {
        const chunk = file.slice(current, current + DEFAULT_SIZE) // 对Blob进行分片
        partList.push({
            chunk,
            size: chunk.size,
        })
        current += DEFAULT_SIZE
    }
    return partList
}

export default Upload