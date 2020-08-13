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
    await mergeChunks(filename, +size)
    res.json({ success: true })
})
app.post('/upload/:filename/:chunk_name/:start', async (req: Request, res: Response, next: NextFunction) => {
    const { filename, chunk_name, start: _start } = req.params
    const start = +_start
    const chunk_dir = path.join(TMP_DIR, filename)
    const exist = await fs.pathExists(chunk_dir)
    if (!exist) {
        await fs.mkdirs(chunk_dir)
    }
    const chunkFilePath = path.join(chunk_dir, chunk_name)
    const ws = fs.createWriteStream(chunkFilePath, { start, flags: 'a' })
    req.on('end', () => {
        ws.close()
        res.json({ success: true })
    })
    req.on('close', () => ws.close())
    req.on('error', (err) => {
        ws.close()
        next(err)
    })
    req.pipe(ws)
})
app.get('/verify/:filename', async (req: Request, res: Response) => {
    const { filename } = req.params
    const filePath = path.join(PUBLIC_DIR, filename)
    const existFile = await fs.pathExists(filePath)
    if (existFile) {
        res.json({
            success: true,
            needUpload: false // 已经上传过，不需要再上传——即秒传
        })
        return
    }
    const tempDir = path.join(TMP_DIR, filename)
    const exist = await fs.pathExists(tempDir)
    let uploadList: any[] = []
    if (exist) {
        uploadList = await fs.readdir(tempDir)
        uploadList = await Promise.all(uploadList.map(async (chunk_name: string) => {
            let stat = await fs.stat(path.join(tempDir, chunk_name))
            return {
                chunk_name,
                size: stat.size // 已经写入的大小
            }
        }))
    }
    res.json({
        success: true,
        needUpload: true,
        uploadList
    })
})
app.use(function (_req, _res, next) {
    next(createError(404))
})
app.use(function (error: any, _req: Request, res: Response, _next: NextFunction) {
    res.status(error.status || INTERNAL_SERVER_ERROR)
    res.json({
        success: false,
        error
    })
})
export default app