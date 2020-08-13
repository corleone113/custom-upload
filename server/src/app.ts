import Express, { Request, Response, NextFunction, } from 'express'
import logger from 'morgan'
import { INTERNAL_SERVER_ERROR, } from 'http-status-codes'
import createError from 'http-errors'
import cors from 'cors'
import path from 'path'
import fs from 'fs-extra'
import { PUBLIC_DIR, TMP_DIR, mergeChunks } from './utils'

const app = Express()
app.use(logger('dev'))
app.use(Express.json()) // 处理body响应体
app.use(Express.urlencoded({ extended: true }))
app.use(cors()) // 添加跨域支持
app.use(Express.static(PUBLIC_DIR))

app.get('/merge/:filename/:size', async (req: Request, res: Response, _next: NextFunction) => {
    const { filename, size } = req.params
    await mergeChunks(filename, +size) // 进行文件合并，size表示分片文件的大小
    res.json({ success: true })
})
app.post('/upload/:filename/:chunk_name/:start', async (req: Request, res: Response, next: NextFunction) => {
    const { filename, chunk_name, start: _start } = req.params // filename为文件名称，也是存放分片文件的文件夹的名称；chunk_name为分片文件名称；start为分片文件写入时的开始位置——为了实现断点续传、暂停/恢复
    const start = +_start
    const chunk_dir = path.join(TMP_DIR, filename) // 分片文件保存的路径
    const exist = await fs.pathExists(chunk_dir)
    if (!exist) { // 分片文件目录不存在则先创建它
        await fs.mkdirs(chunk_dir)
    }
    const chunkFilePath = path.join(chunk_dir, chunk_name)
    const ws = fs.createWriteStream(chunkFilePath, { start, flags: 'a' }) // 创建写入分片文件的WriteStream
    req.on('end', () => { // 写入结束时关闭写入流并返回成功的响应
        ws.close()
        res.json({ success: true })
    })
    req.on('close', () => ws.close()) // 中断(暂停或取消)时主动关闭分片写入流
    req.on('error', (err) => { // 发生错误时现关闭写入流再交给后续处理错误的中间件处理。
        ws.close()
        next(err)
    })
    req.pipe(ws) // 通过pipe来进行写入
})
app.get('/verify/:filename', async (req: Request, res: Response) => {
    const { filename } = req.params
    const filePath = path.join(PUBLIC_DIR, filename) // 合并后的文件的路径
    const existFile = await fs.pathExists(filePath)
    if (existFile) { // 判断是否上传过(指定文件是否已经合并)
        res.json({
            success: true,
            needUpload: false // 已经上传过，不需要再上传——即秒传
        })
        return
    }
    const tempDir = path.join(TMP_DIR, filename) // 存放分片文件的路径
    const exist = await fs.pathExists(tempDir)
    let uploadList: any[] = []
    if (exist) { // 分片文件目录存在说明已经上传过部分分片文件
        uploadList = await fs.readdir(tempDir)
        uploadList = await Promise.all(uploadList.map(async (chunk_name: string) => {
            let stat = await fs.stat(path.join(tempDir, chunk_name))
            return {
                chunk_name, // 分片文件名称
                size: stat.size // 已经写入的大小
            }
        }))
    }
    res.json({
        success: true,
        needUpload: true, // 需要继续上传
        uploadList // 保存已上传的分片的信息的数组
    })
})
app.use(function (_req, _res, next) {
    next(createError(404))
})
app.use(function (error: any, _req: Request, res: Response, _next: NextFunction) { // 处理错误的中间件，返回错误反馈信息
    res.status(error.status || INTERNAL_SERVER_ERROR)
    res.json({
        success: false,
        error
    })
})
export default app