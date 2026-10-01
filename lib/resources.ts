export type Resource = {
  id: number;
  title: string;
  desc: string;
  tag: string;
  date: string;
  important: boolean;
};

export const tags = ["全部", "教程", "工具", "文章", "课程"];

export const resources: Resource[] = [
  {
    id: 1,
    title: "Next.js 官方入门教程",
    desc: "官方的 Learn 课程，一步步带你做出一个看板应用。",
    tag: "教程",
    date: "2026-09-12",
    important: true,
  },
  {
    id: 2,
    title: "Tailwind CSS 中文文档",
    desc: "写样式基本靠它，常用类名都能在这里查到。",
    tag: "教程",
    date: "2026-09-10",
    important: true,
  },
  {
    id: 3,
    title: "Excalidraw",
    desc: "手绘风格的在线画图板，画流程图和草图很好用。",
    tag: "工具",
    date: "2026-09-08",
    important: false,
  },
  {
    id: 4,
    title: "为什么要做个人项目",
    desc: "一篇讲透了「项目经验」和「做题」差别的文章。",
    tag: "文章",
    date: "2026-09-05",
    important: false,
  },
  {
    id: 5,
    title: "Git 简明指南",
    desc: "保存、恢复版本够用的那一小部分命令。",
    tag: "教程",
    date: "2026-09-02",
    important: false,
  },
  {
    id: 6,
    title: "Raycast",
    desc: "Mac 上的效率启动器，把常用操作都收进一个搜索框。",
    tag: "工具",
    date: "2026-08-28",
    important: false,
  },
  {
    id: 7,
    title: "怎样提出一个好问题",
    desc: "提问的方式决定了能得到什么样的回答。",
    tag: "文章",
    date: "2026-08-25",
    important: true,
  },
  {
    id: 8,
    title: "CS 自学指南",
    desc: "一份很全的计算机课程学习路线和资源汇总。",
    tag: "课程",
    date: "2026-08-20",
    important: false,
  },
  {
    id: 9,
    title: "React 哲学",
    desc: "官方经典文章，讲怎么从设计稿出发思考界面。",
    tag: "文章",
    date: "2026-08-15",
    important: false,
  },
];
