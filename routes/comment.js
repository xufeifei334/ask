
const validator = require('validator');
// 引入Comment表
const Comment = require('../model/Comment');
// 引入Reply表
const Reply = require('../model/Reply');
// 引入User表
const User = require('../model/User');
// 引入at表
const at = require('../common/at');
// 引入message功能
const message = require('../common/message');
// 二级回复
exports.add = (req, res, next) => {
    // 二级回复的添加
    // 1.获取请求过来的数据
    let content = req.body.content; // 二级回复内容
    let reply_id = req.body.reply_id; // 对应一级回复
    let comment_target_id = req.body.comment_target_id; // 回复的人
    let question_id = req.params.question_id; //问题的ID
    let author = req.session.user._id; // 作者
    if (content.length <= 0) {
        res.json({message: '长度不能为空'});
    } else {
        // 2.存入Comment表
        let newComment = new Comment();
        newComment.content = content;
        newComment.reply_id = reply_id;
        newComment.comment_target_id = comment_target_id;
        newComment.question_id = question_id;
        newComment.author = author;
        newComment.save().then(comment => {
            let result = Comment.findOne({'_id': comment._id}).populate('reply_id').populate('comment_target_id').populate('question_id').populate('author');
            return result;
        }).then(comment => {
            // 3.一级回复有个字段comment_num + 1
            comment.reply_id.comment_num += 1;
            comment.reply_id.save();
            return comment;
        }).then(comment => {
            // 4.如果在二级回复中@某个人，这个人上线的会接收到@消息
            // 给当前@的人发送消息，里面不包含作者以及一级回复的人
            // 这里，要考虑一个特殊情况，文章作者 == 一级回复的作者
            let queryArray = [];
            if (comment.question_id.author == comment.reply_id.author) {
                queryArray.push(comment.question_id.author);
            } else {
                queryArray.push(comment.question_id.author);
                queryArray.push(comment.reply_id.author);
            }
            User.find({'_id': {$in: queryArray}}).then(authors => {
                let newContent = null;
                if (authors.length == 1) {
                    let author_name = authors[0].name;
                    let regex1 = new RegExp('@' + author_name + '\\b(?!\ \])', 'g')
                    newContent = content.replace(regex1, '')
                } else if (authors.length == 2) {
                    let author_name = authors[0].name;
                    let reply_name = authors[1].name;
                    let regex1 = new RegExp('@' + author_name + '\\b(?!\ \])', 'g')
                    let regex2 = new RegExp('@' + reply_name + '\\b(?!\\])', 'g');
                    newContent = content.replace(regex1, '').replace(regex2, '');
                }
                at.sendMessageToMentionUsers(newContent, comment.question_id._id, comment.author._id, comment.reply_id._id, comment._id, (err, msg) => {
                    if (err) {
                        return res.end(err);
                    }
                })
            })
            return comment;
        }).then(comment => {
            // 5.在给回复的目标发送有人评论了回复
            // 第一种情况，没有说明回复谁，默认是回复一级的作者
            // 第二种情况，直接点击回复某个人
            if (comment.comment_target_id == null && comment.reply_id.author != req.session.user._id) {
                // 默认是给一级回复作者发消息
                message.sendCommentMessage(comment.reply_id.author, comment.author, comment.question_id, comment.reply_id, comment._id);
            } else if (comment.comment_target_id != null && comment.comment_target_id._id != req.session.user._id) {
                // 给comment_target_id对应的人发消息
                message.sendCommentMessage(comment.comment_target_id, comment.author, comment.question_id, comment.reply_id, comment._id);
            }
            return comment;
        }).then(comment => {
            // 6.返回最新评论的页面
            // 如果@某个人，给它加个链接
            comment.content = at.linkUsers(comment.content);
            return res.render('comment-spa', {
                comment: comment,
                layout: ''
            })
        }).catch(err => {
            res.json({message: '出错了'});
        })
    }
}
// 显示所有二级回复
exports.show = (req, res, next) => {
    // 一级回复的ID号，根据这个查询条件查询出所有对应的二级回复
    let reply_id = req.params.reply_id;
    let mission1 = new Promise((resolve, reject) => {
        Comment.getCommentsByReplyId(reply_id, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        })
    })
    let miession2 = new Promise((resolve, reject) => {
        Comment.getCommentsByReplyAll(reply_id, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        })
    })
    Promise.all([mission1, miession2]).then(result => {
        let comments = result[0];
        let total = result[1].length;
        let totalPage = Math.ceil(total / 10);
        let commentPage = [];
        for (let i = 1; i <= totalPage; i++) {
            commentPage.push(i);
        }
        res.render('comments', {
            comments: comments,
            commentPage: commentPage,
            currentPage: 1,
            layout: ''
        })
    })
}

// 二级回复分页
exports.showCommentPage = (req, res, next) => {
    let reply_id = req.params.reply_id;
    let page = req.params.page;
    let limit = 10;
    let startNum = (page - 1) * limit;
    Comment.getCommentsByPage(reply_id, startNum, limit, (err, comments) => {
        if(err) {
            return res.end(err)
        }
        return res.render('show-comments', {
            comments: comments,
            layout: ''
        })
    })
}