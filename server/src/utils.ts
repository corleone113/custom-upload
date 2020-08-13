import path from 'path'
import fs, { WriteStream, } from 'fs-extra'
import { pipeline } from 'stream'

const DEFAULT_SIZE = 80 * 1024

export const TMP_DIR = path.join(__dirname, 'tmp')
export const PUBLIC_DIR = path.join(__dirname, 'public')

export const splitChunks = async (filepath: string, size: number = DEFAULT_SIZE) => {
    const filePath = path.join(__dirname, filepath)
    let filename = filepath.split('/').pop()
    filename = filename ? filename : filepath
    const chunksDir = path.join(TMP_DIR, filename)
    await fs.mkdirp(chunksDir)
    const content = await fs.readFile(filePath)
    let i = 0, current = 0; const { length } = content
    while (current < length) {
        await fs.writeFile(
            path.join(chunksDir, filename + '-' + i),
            content.slice(current, current + size)
        )
        ++i
        current += size
    }
}
// splitChunks('some.jpg')

const pipeStream = (filePath: string, ws: WriteStream,) => new Promise((resolve, reject) => {
    const rs = fs.createReadStream(filePath)
    pipeline(rs, ws, (err) => {
        if (err) return reject(err)
        fs.unlink(filePath)
        resolve()
    })
})
export const mergeChunks = async (filename: string, size: number = DEFAULT_SIZE) => {
    const filePath = path.join(PUBLIC_DIR, filename)
    const exist = await fs.pathExists(filePath)
    if(!exist){
        await fs.createFile(filePath)
    }
    const chunksDir = path.join(TMP_DIR, filename)
    const chunkFiles = await fs.readdir(chunksDir)
    chunkFiles.sort((a, b) => +(a.split('-')[1]) - +(b.split('-')[1]))
    await Promise.all(chunkFiles.map((chunkFile, index) => pipeStream(
        path.join(chunksDir, chunkFile),
        fs.createWriteStream(filePath, {
            start: index * size,
            flags: 'r+', // 必须改为'r+'。默认是'w'，即截断式，如果分片较少时，通过promise.all进行并发写入时，writestream打开状态可以有两到三个(根据硬件性能决定)工作线程进行并行写入，此时可以成功写入；但是分片稍多时，会因为截断而导致前面写入的内容丢失从而导致文件内容不正确。
        }),
    )))
    fs.emptyDir(chunksDir, (err)=>{
        if(err) return console.error('Meet some error while remove sub file or directory:', err)
        fs.rmdirSync(chunksDir)
    })
}
// mergeChunks('some.jpg')