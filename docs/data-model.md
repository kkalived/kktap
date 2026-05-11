# 数据模型

## 存储位置

- 数据文件：`%APPDATA%/KKTap/data.json`
- 图片文件：`%APPDATA%/KKTap/images/`

## 数据结构

```json
{
  "version": 1,
  "stacks": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "position": { "x": 100, "y": 200 },
      "size": { "width": 280, "height": 280 },
      "rotation": 1.2,
      "notes": [
        {
          "id": "660e8400-e29b-41d4-a716-446655440002",
          "type": "text",
          "content": "待办：今天要完成的事情...\n1. 买菜\n2. 写报告\n3. 打电话",
          "images": [],
          "createdAt": "2026-05-09T10:00:00Z",
          "updatedAt": "2026-05-09T10:30:00Z"
        },
        {
          "id": "770e8400-e29b-41d4-a716-446655440003",
          "type": "image",
          "content": "",
          "images": ["screenshot-20260509-103000.png"],
          "createdAt": "2026-05-09T10:31:00Z",
          "updatedAt": "2026-05-09T10:31:00Z"
        }
      ]
    }
  ],
  "deletedNotes": [
    {
      "originalStackId": "550e8400-e29b-41d4-a716-446655440001",
      "note": {
        "id": "880e8400-e29b-41d4-a716-446655440004",
        "type": "text",
        "content": "已完成的旧事项...",
        "images": [],
        "createdAt": "2026-05-08T15:00:00Z",
        "updatedAt": "2026-05-08T16:00:00Z"
      },
      "deletedAt": "2026-05-09T08:00:00Z"
    }
  ],
  "settings": {
    "screenshotHotkey": "Ctrl+Alt+Z",
    "autoStart": false,
    "defaultNoteWidth": 280,
    "defaultNoteHeight": 280,
    "maxStackSize": 3,
    "stackOverlapThreshold": 30
  }
}
```

## Stack（堆）

一个堆代表屏幕上同一位置的一组便利贴窗口。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string (UUIDv4) | 唯一标识 |
| position | {x, y} | 屏幕坐标（像素） |
| size | {width, height} | 窗口尺寸（像素） |
| rotation | number | 旋转角度（-1.5 ~ 1.5 度） |
| notes | Note[] | 便利贴数组（最多 3 张） |

## Note（便利贴）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string (UUIDv4) | 唯一标识 |
| type | "text" \| "image" | 内容类型 |
| content | string | 文字内容（type=text 时） |
| images | string[] | 图片文件名列表（存储在 images/ 目录） |
| createdAt | string (ISO 8601) | 创建时间 |
| updatedAt | string (ISO 8601) | 最后修改时间 |

## DeletedNote（已删除便利贴）

| 字段 | 类型 | 说明 |
|---|---|---|
| originalStackId | string | 删除前所在的堆 ID |
| note | Note | 便利贴完整数据 |
| deletedAt | string (ISO 8601) | 删除时间 |

## Settings（设置）

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| screenshotHotkey | string | "Ctrl+Alt+Z" | 截图快捷键 |
| autoStart | boolean | false | 开机自启 |
| defaultNoteWidth | number | 280 | 新便利贴默认宽度 |
| defaultNoteHeight | number | 280 | 新便利贴默认高度 |
| maxStackSize | number | 3 | 堆最大便利贴数 |
| stackOverlapThreshold | number | 30 | 合并判定距离（像素） |
