/************************************************************************
 * This file is part of EspoCRM.
 *
 * EspoCRM - Open Source CRM application.
 * Copyright (C) 2014-2022 Yurii Kuznietsov, Taras Machyshyn, Oleksii Avramenko
 * Website: https://www.espocrm.com
 *
 * EspoCRM is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * EspoCRM is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with EspoCRM. If not, see http://www.gnu.org/licenses/.
 *
 * The interactive user interfaces in modified source and object code versions
 * of this program must display Appropriate Legal Notices, as required under
 * Section 5 of the GNU General Public License version 3.
 *
 * In accordance with Section 7(b) of the GNU General Public License version 3,
 * these Appropriate Legal Notices must retain the display of the "EspoCRM" word.
 ************************************************************************/

define('views/fields/attachment-multiple', ['views/fields/base', 'helpers/file-upload'], function (Dep, FileUpload) {

    return Dep.extend({

        type: 'attachmentMultiple',

        listTemplate: 'fields/attachments-multiple/list',

        detailTemplate: 'fields/attachments-multiple/detail',

        editTemplate: 'fields/attachments-multiple/edit',

        searchTemplate: 'fields/link-multiple/search',

        previewSize: 'medium',

        nameHashName: null,

        idsName: null,

        nameHash: null,

        foreignScope: null,

        showPreviews: true,

        accept: null,

        validations: ['ready', 'required'],

        searchTypeList: ['isNotEmpty', 'isEmpty'],

        events: {
            'click a.remove-attachment': function (e) {
                var $div = $(e.currentTarget).parent();

                var id = $div.attr('data-id');

                if (id) {
                    this.deleteAttachment(id);
                }

                $div.parent().remove();

                this.$el.find('input.file').val(null);
            },
            'change input.file': function (e) {
                var $file = $(e.currentTarget);
                var files = e.currentTarget.files;

                this.uploadFiles(files);

                $file.replaceWith($file.clone(true));
            },
            'click a.action[data-action="insertFromSource"]': function (e) {
                var name = $(e.currentTarget).data('name');
                this.insertFromSource(name);
            },
            'click a[data-action="showImagePreview"]': function (e) {
                e.preventDefault();

                var id = $(e.currentTarget).data('id');

                var attachmentIdList = this.model.get(this.idsName) || [];
                var typeHash = this.model.get(this.typeHashName) || {};

                var imageIdList = [];

                attachmentIdList.forEach(cId => {
                    if (!this.isTypeIsImage(typeHash[cId])) {
                        return;
                    }

                    imageIdList.push(cId);
                });

                var imageList = [];

                imageIdList.forEach((cId) => {
                    imageList.push({
                        id: cId,
                        name: this.nameHash[cId]
                    });
                });

                this.createView('preview', 'views/modals/image-preview', {
                    id: id,
                    model: this.model,
                    name: this.nameHash[id],
                    imageList: imageList
                }, (view) => {
                    view.render();
                });
            },
        },

        data: function () {
            var ids = this.model.get(this.idsName);

            var data = _.extend({
                idValues: this.model.get(this.idsName),
                idValuesString: ids ? ids.join(',') : '',
                nameHash: this.model.get(this.nameHashName),
                foreignScope: this.foreignScope,
                valueIsSet: this.model.has(this.idsName),
                acceptAttribute: this.acceptAttribute,
            }, Dep.prototype.data.call(this));

            if (this.mode === 'edit') {
                data.fileSystem = ~this.sourceList.indexOf('FileSystem');
                data.sourceList = this.sourceList;
            }

            return data;
        },

        setup: function () {
            this.nameHashName = this.name + 'Names';
            this.typeHashName = this.name + 'Types';
            this.idsName = this.name + 'Ids';
            this.foreignScope = 'Attachment';

            this.previewSize = this.options.previewSize || this.params.previewSize || this.previewSize;

            this.previewTypeList = this.getMetadata().get(['app', 'image', 'previewFileTypeList']) || [];
            this.imageSizes = this.getMetadata().get(['app', 'image', 'sizes']) || {};

            this.nameHash = _.clone(this.model.get(this.nameHashName)) || {};

            if ('showPreviews' in this.params) {
                this.showPreviews = this.params.showPreviews;
            }

            if ('accept' in this.params) {
                this.accept = this.params.accept;
            }

            if (this.accept && this.accept.length) {
                this.acceptAttribute = this.accept.join(', ');
            }

            var sourceDefs = this.getMetadata().get(['clientDefs', 'Attachment', 'sourceDefs']) || {};

            this.sourceList = Espo.Utils.clone(this.params.sourceList || []);

            this.sourceList = this.sourceList
                .concat(
                    this.getMetadata().get(['clientDefs', 'Attachment', 'generalSourceList']) || []
                )
                .filter((item, i, self) => {
                    return self.indexOf(item) === i;
                })
                .filter((item) => {
                    var defs = sourceDefs[item] || {};

                    if (defs.accessDataList) {
                        if (
                            !Espo.Utils.checkAccessDataList(
                                defs.accessDataList, this.getAcl(), this.getUser()
                            )
                        ) {
                            return false;
                        }
                    }

                    if (defs.configCheck) {
                        var arr = defs.configCheck.split('.');

                        if (!this.getConfig().getByPath(arr)) {
                            return false;
                        }
                    }

                    return true;
                });

            this.listenTo(this.model, 'change:' + this.nameHashName, () => {
                this.nameHash = _.clone(this.model.get(this.nameHashName)) || {};
            });

            this.once('remove', () => {
                if (this.resizeIsBeingListened) {
                    $(window).off('resize.' + this.cid);
                }
            });

            this.on('inline-edit-off', () => {
                this.isUploading = false;
            });
        },

        setupSearch: function () {
            this.events = _.extend({
                'change select.search-type': (e) => {
                    var type = $(e.currentTarget).val();

                    this.handleSearchType(type);
                },
            }, this.events || {});
        },

        empty: function () {
            this.clearIds();

            this.$attachments.empty();
        },

        handleResize: function () {
            var width = this.$el.width();

            this.$el.find('img.image-preview').css('maxWidth', width + 'px');
        },

        deleteAttachment: function (id) {
            this.removeId(id);

            if (this.model.isNew()) {
                this.getModelFactory().create('Attachment', (attachment) => {
                    attachment.id = id;
                    attachment.destroy();
                });
            }
        },

        getImageUrl: function (id, size) {
            var url = this.getBasePath() + '?entryPoint=image&id=' + id;

            if (size) {
                url += '&size=' + size;
            }

            if (this.getUser().get('portalId')) {
                url += '&portalId=' + this.getUser().get('portalId');
            }

            return url;
        },

        getDownloadUrl: function (id) {
            id = Handlebars.Utils.escapeExpression(id);

            var url = this.getBasePath() + '?entryPoint=download&id=' + id;

            if (this.getUser().get('portalId')) {
                url += '&portalId=' + this.getUser().get('portalId');
            }

            return url;
        },

        removeId: function (id) {
            var arr = _.clone(this.model.get(this.idsName) || []);

            var i = arr.indexOf(id);

            arr.splice(i, 1);

            this.model.set(this.idsName, arr);

            var nameHash = _.clone(this.model.get(this.nameHashName) || {});

            delete nameHash[id];

            this.model.set(this.nameHashName, nameHash);

            var typeHash = _.clone(this.model.get(this.typeHashName) || {});

            delete typeHash[id];

            this.model.set(this.typeHashName, typeHash);
        },

        clearIds: function (silent) {
            var silent = silent || false;

            this.model.set(this.idsName, [], {silent: silent});
            this.model.set(this.nameHashName, {}, {silent: silent});
            this.model.set(this.typeHashName, {}, {silent: silent})
        },

        pushAttachment: function (attachment, link, ui) {
            var arr = _.clone(this.model.get(this.idsName) || []);

            arr.push(attachment.id);

            this.model.set(this.idsName, arr, {ui: ui});

            var typeHash = _.clone(this.model.get(this.typeHashName) || {});

            typeHash[attachment.id] = attachment.get('type');

            this.model.set(this.typeHashName, typeHash, {ui: ui});

            var nameHash = _.clone(this.model.get(this.nameHashName) || {});

            nameHash[attachment.id] = attachment.get('name');

            this.model.set(this.nameHashName, nameHash, {ui: ui});
        },

        getEditPreview: function (name, type, id) {
            name = Handlebars.Utils.escapeExpression(name);
            id = Handlebars.Utils.escapeExpression(id);

            if (!~this.previewTypeList.indexOf(type)) {
                return name;
            }

            let html = $('<img>')
                .attr('src', this.getImageUrl(id, 'small'))
                .attr('title', name)
                .attr('draggable', false)
                .css({
                    maxWidth: (this.imageSizes[this.previewSize] || {})[0],
                    maxHeight: (this.imageSizes[this.previewSize] || {})[1],
                })
                .get(0)
                .outerHTML;

            return html;
        },

        getBoxPreviewHtml: function (name, type, id) {
            let preview = name;

            if (this.showPreviews && id) {
                preview = this.getEditPreview(name, type, id);
            } else {
                preview = Handlebars.Utils.escapeExpression(preview);
            }

            if (preview === name && id) {
                preview = '<a href="' + this.getBasePath() + '?entryPoint=download&id=' + id + '" target="_BLANK">' +
                    name + '</a>';
            }

            return preview;
        },

        addAttachmentBox: function (name, type, id) {
            id = Handlebars.Utils.escapeExpression(id);

            let $attachments = this.$attachments;

            let removeLink = '<a href="javascript:" class="remove-attachment pull-right">'+
                '<span class="fas fa-times"></span></a>';

            let previewHtml = this.getBoxPreviewHtml(name, type, id);

            let $att = $('<div>')
                .addClass('gray-box')
                .append(removeLink)
                .append(
                    $('<span class="preview">' + previewHtml + '</span>')
                );

            let $container = $('<div>').append($att);

            $attachments.append($container);

            if (id) {
                $att.attr('data-id', id);

                return $att;
            }

            let $loading = $('<span class="small uploading-message">' +
                this.translate('Uploading...') + '</span>');

            $container.append($loading);

            $att.on('ready', () => {
                $loading.html(this.translate('Ready'));

                let id = $att.attr('data-id');

                let previewHtml = this.getBoxPreviewHtml(name, type, id);

                $att.find('.preview').html(previewHtml);

                if ($att.find('.preview').children().get(0).tagName === 'IMG') {
                    $loading.remove();
                }
            });

            return $att;
        },

        showValidationMessage: function (msg, selector) {
            var $label = this.$el.find('label');
            var title = $label.attr('title');

            $label.attr('title', '');

            Dep.prototype.showValidationMessage.call(this, msg, selector);

            $label.attr('title', title);
        },

        getMaxFileSize: function () {
            let maxFileSize = this.params.maxFileSize || 0;

            let noChunk = !this.getConfig().get('attachmentUploadChunkSize');
            let attachmentUploadMaxSize = this.getConfig().get('attachmentUploadMaxSize') || 0;
            let appMaxUploadSize = this.getHelper().getAppParam('maxUploadSize') || 0;

            if (!maxFileSize || maxFileSize > attachmentUploadMaxSize) {
                maxFileSize = attachmentUploadMaxSize;
            }

            if (noChunk && maxFileSize > appMaxUploadSize) {
                maxFileSize = appMaxUploadSize;
            }

            return maxFileSize;
        },

        uploadFiles: function (files) {
            let uploadedCount = 0;
            let totalCount = 0;

            let exceedsMaxFileSize = false;

            let maxFileSize = this.getMaxFileSize();

            if (maxFileSize) {
                for (let i = 0; i < files.length; i++) {
                    let file = files[i];

                    if (file.size > maxFileSize * 1024 * 1024) {
                        exceedsMaxFileSize = true;
                    }
                }
            }

            if (exceedsMaxFileSize) {
                let msg = this.translate('fieldMaxFileSizeError', 'messages')
                    .replace('{field}', this.getLabelText())
                    .replace('{max}', maxFileSize);

                this.showValidationMessage(msg, 'label');

                return;
            }

            this.isUploading = true;

            this.getModelFactory().create('Attachment', model => {
                let canceledList = [];

                let fileList = [];

                for (let i = 0; i < files.length; i++) {
                    fileList.push(files[i]);

                    totalCount++;
                }

                let uploadHelper = new FileUpload(this.getConfig());

                fileList.forEach(file => {
                    let $attachmentBox = this.addAttachmentBox(file.name, file.type);

                    let $uploadingMsg = $attachmentBox.parent().find('.uploading-message');

                    let mediator = {};

                    $attachmentBox.find('.remove-attachment').on('click.uploading', () => {
                        canceledList.push(attachment.cid);

                        totalCount--;

                        if (uploadedCount === totalCount) {
                            this.isUploading = false;

                            if (totalCount) {
                                this.afterAttachmentsUploaded.call(this);
                            }
                        }

                        mediator.isCanceled = true;
                    });

                    let attachment = model.clone();

                    attachment.set('role', 'Attachment');
                    attachment.set('parentType', this.model.name);
                    attachment.set('field', this.name);

                    uploadHelper
                        .upload(file, attachment, {
                            afterChunkUpload: (size) => {
                                let msg = Math.floor((size / file.size) * 100) + '%';

                                $uploadingMsg.html(msg);
                            },
                            afterAttachmentSave: (attachment) => {
                                $attachmentBox.attr('data-id', attachment.id);
                            },
                            mediator: mediator,
                        })
                        .then(() => {
                            if (canceledList.indexOf(attachment.cid) !== -1) {
                                return;
                            }

                            this.pushAttachment(attachment, null, true);

                            $attachmentBox.attr('data-id', attachment.id);
                            $attachmentBox.trigger('ready');

                            uploadedCount++;

                            if (uploadedCount === totalCount && this.isUploading) {
                                this.model.trigger('attachment-uploaded:' + this.name);
                                this.afterAttachmentsUploaded.call(this);

                                this.isUploading = false;
                            }
                        })
                        .catch(() => {
                            if (mediator.isCenceled) {
                                return;
                            }

                            $attachmentBox.remove();
                            $uploadingMsg.remove();

                            totalCount--;

                            if (!totalCount) {
                                this.isUploading = false;
                            }

                            if (uploadedCount === totalCount && this.isUploading) {
                                this.isUploading = false;
                                this.afterAttachmentsUploaded.call(this);
                            }
                        });
                });
            });
        },

        afterAttachmentsUploaded: function () {},

        afterRender: function () {
            if (this.mode === 'edit') {
                this.$attachments = this.$el.find('div.attachments');

                var ids = this.model.get(this.idsName) || [];

                var hameHash = this.model.get(this.nameHashName);
                var typeHash = this.model.get(this.typeHashName) || {};

                ids.forEach((id) => {
                    if (hameHash) {
                        var name = hameHash[id];
                        var type = typeHash[id] || null;
                        this.addAttachmentBox(name, type, id);
                    }
                });

                this.$el.off('drop');
                this.$el.off('dragover');
                this.$el.off('dragleave');

                this.$el.on('drop', (e) => {
                    e.preventDefault();

                    e.stopPropagation();

                    var e = e.originalEvent;

                    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
                        this.uploadFiles(e.dataTransfer.files);
                    }
                });

                this.$el.get(0).addEventListener('dragover', (e) => {
                    e.preventDefault();
                });

                this.$el.get(0).addEventListener('dragleave', (e) => {
                    e.preventDefault();
                });
            }

            if (this.mode === 'search') {
                var type = this.$el.find('select.search-type').val();

                this.handleSearchType(type);
            }

            if (this.mode === 'detail') {
                if (this.previewSize === 'large') {
                    this.handleResize();
                    this.resizeIsBeingListened = true;

                    $(window).on('resize.' + this.cid, () => {
                        this.handleResize();
                    });
                }
            }
        },

        isTypeIsImage: function (type) {
            if (~this.previewTypeList.indexOf(type)) {
                return true;
            }

            return false;
        },

        getDetailPreview: function (name, type, id) {
            name = Handlebars.Utils.escapeExpression(name);
            id = Handlebars.Utils.escapeExpression(id);

            if (!this.isTypeIsImage(type)) {
                return name;
            }

            let html = $('<a>')
                .attr('data-action', 'showImagePreview')
                .attr('data-id', id)
                .attr('title', name)
                .attr('href', this.getImageUrl(id))
                .append(
                    $('<img>')
                        .attr('src', this.getImageUrl(id, this.previewSize))
                        .addClass('image-preview')
                        .css({
                            maxWidth: (this.imageSizes[this.previewSize] || {})[0],
                            maxHeight: (this.imageSizes[this.previewSize] || {})[1],
                        })
                )
                .get(0)
                .outerHTML;

            return html;
        },

        getValueForDisplay: function () {
            if (this.mode === 'detail' || this.isListMode()) {
                var nameHash = this.nameHash;

                var typeHash = this.model.get(this.typeHashName) || {};

                var previews = [];
                var names = [];

                for (var id in nameHash) {
                    var type = typeHash[id] || false;
                    var name = nameHash[id];

                    if (
                        this.showPreviews
                        &&
                        ~this.previewTypeList.indexOf(type)
                        &&
                        (this.mode === 'detail' || this.mode === 'list' && this.showPreviewsInListMode)
                    ) {
                        previews.push(
                            '<div class="attachment-preview">' +
                            this.getDetailPreview(name, type, id) + '</div>'
                        );

                        continue;
                    }

                    var line = '<div class="attachment-block">' +
                        '<span class="fas fa-paperclip text-soft small"></span> ' +
                        '<a href="' + this.getDownloadUrl(id) + '" target="_BLANK">' +
                        Handlebars.Utils.escapeExpression(name) + '</a></div>';

                    names.push(line);
                }

                let containerClassName = 'attachment-block-container';

                if (this.previewSize === 'large') {
                    containerClassName += ' attachment-block-container-large';
                }

                if (this.previewSize === 'small') {
                    containerClassName += ' attachment-block-container-small';
                }

                if (names.length === 0 && previews.length === 0) {
                    return '';
                }

                var string = '<div class="'+ containerClassName + '">' + previews.join('') + '</div>' +
                    names.join('');

                return string;
            }
        },

        insertFromSource: function (source) {
            var viewName =
                this.getMetadata().get(['clientDefs', 'Attachment', 'sourceDefs', source, 'insertModalView']) ||
                this.getMetadata().get(['clientDefs', source, 'modalViews', 'select']) ||
                'views/modals/select-records';

            if (viewName) {
                this.notify('Loading...');

                var filters = null;

                if (('getSelectFilters' + source) in this) {
                    filters = this['getSelectFilters' + source]();

                    if (this.model.get('parentId') && this.model.get('parentType') === 'Account') {
                        if (this.getMetadata().get(['entityDefs', source, 'fields', 'account', 'type']) === 'link') {
                            filters = {
                                account: {
                                    type: 'equals',
                                    field: 'accountId',
                                    value: this.model.get('parentId'),
                                    valueName: this.model.get('parentName')
                                }
                            };
                        }
                    }
                }
                var boolFilterList = this.getMetadata().get(
                    ['clientDefs', 'Attachment', 'sourceDefs', source, 'boolFilterList']
                );

                if (('getSelectBoolFilterList' + source) in this) {
                    boolFilterList = this['getSelectBoolFilterList' + source]();
                }

                var primaryFilterName = this.getMetadata().get(
                    ['clientDefs', 'Attachment', 'sourceDefs', source, 'primaryFilter']
                );

                if (('getSelectPrimaryFilterName' + source) in this) {
                    primaryFilterName = this['getSelectPrimaryFilterName' + source]();
                }

                this.createView('insertFromSource', viewName, {
                    scope: source,
                    createButton: false,
                    filters: filters,
                    boolFilterList: boolFilterList,
                    primaryFilterName: primaryFilterName,
                    multiple: true,
                }, (view) => {
                    view.render();

                    this.notify(false);

                    this.listenToOnce(view, 'select', (modelList) =>{
                        if (Object.prototype.toString.call(modelList) !== '[object Array]') {
                            modelList = [modelList];
                        }

                        modelList.forEach((model) => {
                            if (model.name === 'Attachment') {
                                this.pushAttachment(model);

                                return;
                            }

                            this
                                .ajaxPostRequest(source + '/action/getAttachmentList', {
                                    id: model.id,
                                })
                                .then(attachmentList => {
                                    attachmentList.forEach(item => {
                                        this.getModelFactory().create('Attachment', attachment => {
                                            attachment.set(item);

                                            this.pushAttachment(attachment, true);
                                        });
                                    });
                                });
                        });
                    });
                });

                return;
            }
        },

        validateRequired: function () {
            if (this.isRequired()) {
                if ((this.model.get(this.idsName) || []).length === 0) {
                    var msg = this.translate('fieldIsRequired', 'messages').replace('{field}', this.getLabelText());

                    this.showValidationMessage(msg, 'label');

                    return true;
                }
            }
        },

        validateReady: function () {
            if (this.isUploading) {
                var msg = this.translate('fieldIsUploading', 'messages').replace('{field}', this.getLabelText());

                this.showValidationMessage(msg, 'label');

                return true;
            }
        },

        fetch: function () {
            var data = {};

            data[this.idsName] = this.model.get(this.idsName) || [];

            return data;
        },

        handleSearchType: function (type) {
            this.$el.find('div.link-group-container').addClass('hidden');
        },

        fetchSearch: function () {
            var type = this.$el.find('select.search-type').val();

            if (type === 'isEmpty') {
                var data = {
                    type: 'isNotLinked',
                    data: {
                        type: type,
                    },
                };

                return data;
            }
            else if (type === 'isNotEmpty') {
                var data = {
                    type: 'isLinked',
                    data: {
                        type: type,
                    },
                };

                return data;
            }
        },

    });
});
