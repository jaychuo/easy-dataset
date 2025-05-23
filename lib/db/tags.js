'use server';

import path from 'path';
import { getProjectRoot, readJsonFile, writeJsonFile } from './base';
import { db } from '@/lib/db/index';
import fs from 'fs';

// 获取标签树
export async function getTags(projectId) {
  try {
    return await getTagsTreeWithQuestionCount(projectId);
  } catch (error) {
    return [];
  }
}

// 递归查询树状结构，并统计问题数量
async function getTagsTreeWithQuestionCount(projectId, parentId = null) {
  // 查询当前层级的分类
  const tags = await db.tags.findMany({
    where: { parentId, projectId }
  });

  // 遍历每个分类，递归查询子节点
  for (const tag of tags) {
    // 获取当前分类及其子分类的所有 label
    const labels = await getAllLabels(tag.id);

    // 统计当前分类及其子分类的问题数量
    tag.questionCount = await db.questions.count({
      where: { label: { in: labels }, projectId }
    });

    // 递归查询子节点
    tag.child = await getTagsTreeWithQuestionCount(projectId, tag.id);
  }

  return tags;
}

// 获取某个分类及其所有子分类的 label
async function getAllLabels(tagId) {
  const labels = [];
  const queue = [tagId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    const tag = await db.tags.findUnique({
      where: { id: currentId }
    });

    if (tag) {
      labels.push(tag.label);
      // 获取子分类的 ID，加入队列
      const children = await db.tags.findMany({
        where: { parentId: currentId },
        select: { id: true }
      });
      queue.push(...children.map(child => child.id));
    }
  }

  return labels;
}

export async function createTag(projectId, label, parentId) {
  try {
    let data = {
      projectId,
      label
    };
    if (parentId) {
      data.parentId = parentId;
    }
    return await db.tags.create({ data });
  } catch (error) {
    console.error('Error insert tags db:', error);
    throw error;
  }
}

export async function updateTag(label, id) {
  try {
    return await db.tags.update({ where: { id }, data: { label } });
  } catch (error) {
    console.error('Error update tags db:', error);
    throw error;
  }
}

export async function deleteTag(id) {
  try {
    return await db.tags.delete({ where: { id } });
  } catch (error) {
    console.error('Error update tags db:', error);
    throw error;
  }
}

// 保存整个标签树
export async function batchSaveTags(projectId, tags) {
  try {
    // 仅在入口函数删除所有标签，避免递归中重复删除
    await db.tags.deleteMany({ where: { projectId } });
    // 处理标签树
    await insertTags(projectId, tags);
  } catch (error) {
    console.error('Error insert tags db:', error);
    throw error;
  }
}

async function insertTags(projectId, tags, parentId = null) {
  // 删除操作已移至外层函数，这里不再需要
  for (const tag of tags) {
    // 插入当前节点
    const createdTag = await db.tags.create({
      data: {
        projectId,
        label: tag.label,
        parentId: parentId
      }
    });
    // 如果有子节点，递归插入
    if (tag.child && tag.child.length > 0) {
      await insertTags(projectId, tag.child, createdTag.id);
    }
  }
}
