import { useCallback } from 'react'
import { request } from './utils'
import { message } from 'antd'

export interface Part {
    chunk: Blob,
    size: number,
    filename?: string,
    chunk_name?: string,
    loaded?: number,
    percent?: number,
    xhr?: XMLHttpRequest
}

interface Uploaded {
    chunk_name: string,
    size: number
}

export function useRequests(setPartList: (partList: Part[]) => void) {
    return useCallback((partList: Part[], filename: string, uploadList: Uploaded[],) => partList.filter((part: Part) => {
        const uploadedFile = uploadList.find(({ chunk_name }) => chunk_name === part.chunk_name)
        if (!uploadedFile) {
            return true
        } else if (uploadedFile.size < part.chunk.size) { // 上传不完整也需要重新上传
            part.loaded = uploadedFile.size
            part.percent = +((part.loaded / part.chunk.size * 100).toFixed(2))
            return true
        }
        return false
    }).map((part: Part) => request({
        urlPath: `/upload/${filename}/${part.chunk_name}/${part.loaded}`,
        method: 'post',
        headers: {
            'Content-Type': 'application/octet-stream'
        },
        setXHR: (xhr: XMLHttpRequest) => part.xhr = xhr,
        onProgress: (event: ProgressEvent) => {
            part.percent = +(((part.loaded! + event.loaded) / part.chunk.size * 100).toFixed(2))
            setPartList([...partList]) // 刷新页面
        },
        data: part.chunk.slice(part.loaded)
    })), [setPartList])
}

export const DEFAULT_SIZE = 1024 * 1024 * 50

async function verify(filename: string) {
    return request({
        urlPath: `/verify/${filename}`
    })
}

export function useUploadParts(createRequests: Function, setPartList: (partList: Part[]) => void, reset: () => void) {
    return useCallback(async (partList: Part[], filename: string,) => {
        const { needUpload, uploadList } = await verify(filename)
        if (!needUpload) {
            setPartList(partList.map((part: Part) => ({ ...part, percent: 100 })))
            reset()
            return message.success('秒传成功')
        }
        try {
            const requests = createRequests(partList, filename, uploadList)
            await Promise.all(requests)
            await request({
                urlPath: `/merge/${filename}/${DEFAULT_SIZE}`,
            })
            message.success('上传成功')
            reset()
        } catch (err) {
            message.error('上传失败或暂停中')
        }
    }, [createRequests, setPartList, reset])
}

export function useCalculateHash(setHashPercent: (percent: number) => void) {
    return useCallback((partList: Part[]) => {
        const worker = new Worker('/hashWorker.js')
        worker.postMessage({ partList })
        return new Promise((resolve,) => {
            worker.onmessage = (event) => {
                const { percent, hash } = event.data
                setHashPercent(percent)
                if (hash) {
                    resolve(hash)
                }
            }
        })
    }, [setHashPercent])
}