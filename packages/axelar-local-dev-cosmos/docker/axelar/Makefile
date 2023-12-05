.PHONY: build-arm64 build-amd64 push-arm64 push-amd64 push manifest

IMAGE_NAME=nptytn/local-axelard

# Check if VERSION is set
ifndef VERSION
    $(error VERSION is not set)
endif

push-arm64:
	docker build --build-arg ARCH=arm64 -t $(IMAGE_NAME):$(VERSION)-arm64 . --push

push-amd64:
	docker build --build-arg ARCH=amd64 -t $(IMAGE_NAME):$(VERSION)-amd64 . --push

push: push-arm64 push-amd64

manifest:
	docker manifest create $(IMAGE_NAME):$(VERSION) $(IMAGE_NAME):$(VERSION)-arm64 $(IMAGE_NAME):$(VERSION)-amd64
	docker manifest annotate $(IMAGE_NAME):$(VERSION) $(IMAGE_NAME):$(VERSION)-arm64 --os linux --arch arm64
	docker manifest annotate $(IMAGE_NAME):$(VERSION) $(IMAGE_NAME):$(VERSION)-amd64 --os linux --arch amd64
	docker manifest push $(IMAGE_NAME):$(VERSION)
