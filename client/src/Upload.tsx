import React, { ChangeEvent, useState, useEffect, useCallback, } from 'react'
import { Col, Input, Button, message, Table, Progress, Row } from 'antd'
import { useRequests, useUploadParts, useCalculateHash, Part, DEFAULT_SIZE } from './uploadHook'

enum UploadStatus {
    INIT,
    PAUSE,
    UPLOADING,
}
function Upload() {
    const [currentFile, setCurrentFile] = useState<File>()
    const [objectUrl, setObjectUrl] = useState<string>('')
    const [hashPercent, setHashPercent] = useState<number>(0)
    const [filename, setFilename] = useState<string>('')
    const [partList, setPartList] = useState<Part[]>([])
    const [uploadStatus, setUploadStatus] = useState<UploadStatus>(UploadStatus.INIT)
    const reset = useCallback(() => {
        setTimeout(() => {
            setUploadStatus(UploadStatus.INIT)
            setPartList([])
            setHashPercent(0)
            setFilename('')
        }, 500)
    }, [setUploadStatus, setPartList, setHashPercent, setFilename])
    const createRequests = useRequests(setPartList)
    const uploadParts = useUploadParts(createRequests, setPartList, reset)
    const calculateHash = useCalculateHash(setHashPercent)
    useEffect(() => {
        if (currentFile) {
            const currentUrl = URL.createObjectURL(currentFile)
            setObjectUrl(currentUrl)
            return () => URL.revokeObjectURL(currentUrl)
        }
    }, [currentFile])
    const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        const file: File = event.target.files![0]
        console.log('the file:', file)
        setCurrentFile(file)
    }, [setCurrentFile])
    const handleUpload = useCallback(async () => {
        if (!currentFile) {
            return message.error('尚未选择文件')
        }
        if (!allowUpload(currentFile)) return
        setUploadStatus(UploadStatus.UPLOADING)
        const partList: Part[] = createChunks(currentFile)
        const fileHash = await calculateHash(partList)
        const lastDotIndex = currentFile.name.lastIndexOf('.')
        const extName = currentFile.name.slice(lastDotIndex)
        const filename = `${fileHash}${extName}`
        setFilename(filename)
        partList.forEach((part, index) => {
            part.filename = filename
            part.chunk_name = `${filename}-${index}`
            part.loaded = 0
            part.percent = 0
        })
        setPartList(partList)
        await uploadParts(partList, filename,)
    }, [currentFile, calculateHash, setPartList, setFilename, uploadParts,])
    const handlePause = useCallback(() => {
        setUploadStatus(UploadStatus.PAUSE)
        partList.forEach((part: Part) => part.xhr && part.xhr.abort())
    }, [partList, setUploadStatus])
    const handleResume = useCallback(async () => {
        setUploadStatus(UploadStatus.UPLOADING)
        await uploadParts(partList, filename,)
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
    const totalPercent = partList.length > 0 ? partList.reduce((acc: number, curr: Part) => acc + curr.percent!, 0) / partList.length : 0
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
function allowUpload(file: File) {
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
function createChunks(file: File): Part[] {
    let current = 0
    const { size } = file
    const partList: Part[] = []
    while (current < size) {
        const chunk = file.slice(current, current + DEFAULT_SIZE)
        partList.push({
            chunk,
            size: chunk.size,
        })
        current += DEFAULT_SIZE
    }
    return partList
}

export default Upload