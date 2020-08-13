import { useCallback } from 'react'
import { request } from './utils'
import { message } from 'antd'

export interface Part { // 分片相关数据的对象
    chunk: Blob, // 分片文件
    size: number, // 文件尺寸
    filename?: string, // 文件名称
    chunk_name?: string, // 分片文件名称
    loaded?: number, // 分片文件已经上传的部分的尺寸
    percent?: number, // 分片文件上传进度百分比
    xhr?: XMLHttpRequest // 缓存的xhr对象，用于实现暂停效果(通过中断)
}

interface Uploaded {
    chunk_name: string,
    size: number
}

export function useRequests(setPartList: (partList: Part[]) => void) {
    return useCallback((partList: Part[], filename: string, uploadList: Uploaded[],) => partList.filter((part: Part) => { // 过滤掉不需要上传分片
        const uploadedFile = uploadList.find(({ chunk_name }) => chunk_name === part.chunk_name) // 查询已上传的分片中是否包含当前分片
        if (!uploadedFile) { // 没找到说明需要上传
            return true
        } else if (uploadedFile.size < part.chunk.size) { // 上传不完整也需要重新上传
            part.loaded = uploadedFile.size // 更新loaded
            part.percent = +((part.loaded / part.chunk.size * 100).toFixed(2)) // 更新该分片上传进度百分比
            return true
        }
        return false // 以上两种情况之外的情况说明分片已经上传过
    }).map((part: Part) => request({
        urlPath: `/upload/${filename}/${part.chunk_name}/${part.loaded}`,
        method: 'post',
        headers: {
            'Content-Type': 'application/octet-stream'
        },
        setXHR: (xhr: XMLHttpRequest) => part.xhr = xhr, // 缓存该分片上传请求的xhr，方便后续进行暂停(中断)
        onProgress: (event: ProgressEvent) => {
            part.percent = +(((part.loaded! + event.loaded) / part.chunk.size * 100).toFixed(2)) // 计算上传进度百分比
            setPartList([...partList]) // 刷新页面
        },
        data: part.chunk.slice(part.loaded) // 上传未上传过的部分
    })), [setPartList])
}

export const DEFAULT_SIZE = 1024 * 1024 * 50 // 默认分片大小为50mb

async function verify(filename: string) {
    return request({
        urlPath: `/verify/${filename}`
    })
}

export function useUploadParts(createRequests: Function, setPartList: (partList: Part[]) => void, reset: () => void) {
    return useCallback(async (partList: Part[], filename: string,) => {
        const { needUpload, uploadList } = await verify(filename) // 通过'/verify'接口验证是否需要上传
        if (!needUpload) { // needUpload为false表示已经上传过
            setPartList(partList.map((part: Part) => ({ ...part, percent: 100 }))) // 将所有分片上传进度设置为100%
            reset() // 重置状态
            return message.success('秒传成功')
        }
        try {
            const requests = createRequests(partList, filename, uploadList) // 发起上传请求
            await Promise.all(requests) // 并发进行所有分片文件的上传(发送)
            await request({ // 上传结束后发起合并请求
                urlPath: `/merge/${filename}/${DEFAULT_SIZE}`,
            })
            message.success('上传成功')
            reset() //上传成功后进行状态重置
        } catch (err) { // 暂停或发生错误时进行反馈
            message.error('上传失败或暂停中')
        }
    }, [createRequests, setPartList, reset])
}

export function useCalculateHash(setHashPercent: (percent: number) => void) {
    return useCallback((partList: Part[]) => {
        const worker = new Worker('/hashWorker.js') // 通过worker计算文件的hash值
        worker.postMessage({ partList })
        return new Promise((resolve,) => {
            worker.onmessage = (event) => {
                const { percent, hash } = event.data
                setHashPercent(percent) // 更新hash进度。
                if (hash) {
                    resolve(hash) // 计算出hash结束当前promise
                }
            }
        })
    }, [setHashPercent])
}