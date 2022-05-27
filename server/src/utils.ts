import path from 'path'
import fs, { WriteStream, } from 'fs-extra'
import { pipeline } from 'stream'

// const DEFAULT_SIZE = 80 * 1024
const DEFAULT_SIZE = 80 * 1024 * 1024

const rootDir = process.cwd()
export const TMP_DIR = path.join(rootDir, 'tmp')
export const PUBLIC_DIR = path.join(rootDir, 'public')

// 临时测试分片的函数
export const splitChunks = async (filepath: string, size: number = DEFAULT_SIZE) => { // 文件分片
    const filePath = path.join(rootDir, filepath) // 文件路径
    let filename = filepath.split('/').pop() // 获取文件名称
    const chunksDir = path.join(TMP_DIR, filename!) // 存放文件分片的临时路径
    await fs.mkdirp(chunksDir) // 创建存放分片的临时目录
    const { size: len } = await fs.stat(filePath)
    let i = 0, start = 0; const writePromises: Promise<void>[] = []
    while (start < len) { // 开始分片
        writePromises.push(pipeStream(filePath, fs.createWriteStream(path.join(chunksDir, `${filename}-${i}`)), { start, end: start + size }, false))
        ++i
        start += size
    }
    Promise.all(writePromises) // 并发执行。
}

const pipeStream = (filePath: string, ws: WriteStream, options = {}, unlink=true): Promise<void> => new Promise((resolve, reject) => { // 通过pipeline利用stream背压机制避免阻塞、提升读写效率
    const rs = fs.createReadStream(filePath, options)
    pipeline(rs, ws, (err) => {
        if (err) return reject(err)
        unlink && fs.unlink(filePath) // 默认情况写完后删除读取的文件
        resolve() // 读写结束时Promise变为fulfilled状态
    })
})
export const mergeChunks = async (filename: string, size: number = DEFAULT_SIZE) => {
    const filePath = path.join(PUBLIC_DIR, filename) // 合并后的文件写入的位置
    const exist = await fs.pathExists(filePath)
    if (!exist) { // 写入时的flag设置为'r+'，所以如果写入的文件不存在则先创建它
        await fs.createFile(filePath)
    }
    const chunksDir = path.join(TMP_DIR, filename) // 存放分片的目录
    const chunkFiles = await fs.readdir(chunksDir) // 获取分片文件名称数组。
    chunkFiles.sort((a, b) => +(a.split('-')[1]) - +(b.split('-')[1])) // 合并之前按照升序排序，避免出错。
    await Promise.all(chunkFiles.map((chunkFile, index) => pipeStream(
        path.join(chunksDir, chunkFile),
        fs.createWriteStream(filePath, {
            start: index * size,
            flags: 'r+', // 必须改为'r+'。默认是'w'，即截断式，如果分片较少时，通过promise.all进行并发写入时，writestream打开状态可以有两到三个(根据硬件性能决定)工作线程进行并行写入，此时可以成功写入；但是分片稍多时，会因为截断而导致前面写入的内容丢失从而导致文件内容不正确。
        }),
    )))
    fs.emptyDir(chunksDir, (err) => { // 合并结束后删除存放分片文件的目录
        if (err) return console.error('Meet some error while remove sub file or directory:', err)
        fs.rmdirSync(chunksDir)
    })
}